# 03 — Pipeline AI

## Provider

DeepSeek, endpoint kompatibel OpenAI di `https://api.deepseek.com`. Tetap pakai
abstraction layer `lib/ai/provider.ts` supaya provider lain bisa ditambah tanpa
menyentuh pipeline.

Sejak V4 (April 2026) lineup lama diganti dua model. Angka di bawah adalah
kondisi yang dipakai saat spec ini ditulis — **verifikasi ke halaman pricing
resmi sebelum mengunci pemetaan model**, karena promo dan alias berubah.

| Alias | Dipakai untuk |
|---|---|
| V4 Flash | interogasi, brief, domain, story, task, prompt packet, paste-back |
| V4 Flash thinking (`deepseek-reasoner`) | ADR, critic pass, analisis change request |

Pemetaan aksi ke model disimpan di tabel konfigurasi, bukan hardcode, sama
seperti bobot credit.

### Yang berubah karena V4

- **Konteks 1M token.** Tidak perlu chunking. Seluruh spec proyek muat dalam
  satu call, bahkan untuk proyek besar.
- **Cache hit sepersepuluh harga input.** Susun prompt dengan bagian stabil di
  depan dan byte-identical antar call: system prompt, blueprint catalog, schema
  instruction. Bagian variabel di akhir. Ini bukan optimasi opsional, ini yang
  membuat biaya per proyek turun ke level receh.
- **Biaya per proyek penuh jatuh jauh di bawah $1.** Konsekuensinya credit lebih
  berfungsi sebagai rem perilaku daripada sebagai penutup biaya. Free tier boleh
  lebih murah hati dari rencana awal.

### Yang tetap harus diwaspadai

- `response_format` JSON didukung, tapi **tanpa penegakan JSON schema**. Zod di
  sisi kamu adalah satu-satunya jaminan. Jangan pernah percaya bentuk output.
- Latensi lebih tinggi daripada model kelas flagship Barat. Semua job wajib
  lewat Inngest, tidak ada yang berjalan di request-response.
- Data diproses di server DeepSeek. Tulis ini di halaman privasi sejak hari
  pertama, dan sediakan BYOK sebagai jalan keluar bagi yang keberatan.
- Concurrency terbatas. Pasang antrean per org, jangan izinkan satu user
  menjalankan banyak compile bersamaan.

## Aturan pemanggilan

Semua call lewat satu fungsi:

```ts
// lib/ai/run.ts
async function run<T>(opts: {
  orgId: string
  projectId?: string
  action: ActionType
  schema: z.ZodType<T>
  system: string        // stabil, byte-identical per action
  user: string          // variabel
  model?: ModelAlias
  maxRetries?: number   // default 2
}): Promise<T>
```

Kewajiban fungsi ini:

1. Cek credit dan cost cap sebelum memanggil. Kurang berarti lempar
   `InsufficientCreditError`, bukan error generik.
2. Pilih key: BYOK org kalau ada dan valid, kalau tidak pakai key platform.
3. Panggil provider dengan `response_format: { type: 'json_object' }`.
4. Parse dan validasi dengan Zod. Gagal berarti retry dengan pesan error
   validasi disisipkan ke percakapan.
5. Tulis `UsageLog` — selalu, termasuk saat BYOK dan saat gagal.
6. Potong credit hanya kalau berhasil.

## Tahap pipeline

Tiap tahap: satu prompt, satu Zod schema, satu gerbang.

### 1. `compile.brief`

Input: jawaban mentah wawancara.
Output:
```ts
z.object({
  problem: z.string().min(40),
  targetUser: z.string().min(20),
  scope: z.array(z.string()).min(3).max(12),
  nonGoals: z.array(z.string()).min(3).max(15),
  assumptions: z.array(z.object({
    statement: z.string(),
    question: z.string(),   // versi pertanyaan untuk user nanti
  })),
})
```
Instruksi kunci: apa pun yang tidak dinyatakan user secara eksplisit tapi
diperlukan untuk melanjutkan **wajib** masuk `assumptions`. Model cenderung
terlalu percaya diri di sini; prompt harus menuntut daftar asumsi yang panjang.

### 2. `compile.domain`

Input: brief.
Output: array entitas dengan field dan relasi. Validasi tambahan di luar Zod:
setiap `relations[].toRefId` harus menunjuk entitas yang ada di output yang sama.
Gagal berarti retry.

### 3. `compile.stories`

Input: brief + domain.
Output: story dengan acceptance criteria Given/When/Then, tiap story menyebut
`entityRefs` yang dipakainya. Batas: 8 story untuk `lite`, 20 untuk `standard`,
tanpa batas untuk `strict`.

Aturan: acceptance criteria harus terverifikasi. Tolak frasa seperti "berjalan
dengan baik" atau "user merasa nyaman" di critic pass.

### 4. `compile.decisions`

Input: brief + domain + blueprint catalog.
Model: thinking mode.
Output: ADR dengan pilihan, alternatif yang ditolak, dan alasannya.

**Model tidak boleh bebas memilih stack.** Prompt menyodorkan blueprint yang
sudah dikurasi; tugas model adalah memilih di antaranya dan menjelaskan alasan,
bukan mengarang stack baru.

### 5. `compile.critic`

Input: semua output di atas.
Model: thinking mode.
Output:
```ts
z.object({
  contradictions: z.array(z.object({ refIds: z.array(z.string()), issue: z.string() })),
  unmeasurable: z.array(z.object({ refId: z.string(), criterion: z.string() })),
  unboundedScope: z.array(z.string()),
  missingNonGoals: z.array(z.string()),
})
```
Temuan critic tidak otomatis memperbaiki apa pun. Hasilnya ditampilkan ke user
sebagai daftar yang bisa diterima atau diabaikan. Auto-fix berbahaya karena
model akan mengarang untuk menutup celah.

### 6. `compile.tasks`

Input: semua di atas.
Output: milestone dan task. Tiap task wajib punya:
- `definitionOfDone`: minimal 2, harus terverifikasi
- `allowedFiles` dan `forbiddenFiles`: glob
- `dependsOn`: refId task lain
- `storyRefs`: story yang diimplementasi

Validasi non-LLM setelahnya: graf dependensi harus asiklik. Ada siklus berarti
retry.

**Step tidak digenerate di sini.** Hanya MILESTONE dan TASK.

### 7. `tracelinks` — tanpa LLM

Dibangun dari refId yang sudah disebut tiap tahap:
`story.entityRefs` → DERIVES, `task.storyRefs` → IMPLEMENTS,
`decision` yang menyebut task → CONSTRAINS, asumsi yang menyentuh entitas atau
story → ASSUMES, diteruskan ke task yang tertaut.

---

## Prompt packet

Ini output utama produk. 80% template, LLM hanya mengisi `intent` dan
`specialNotes`.

Struktur:

```markdown
## {refId}: {title}

### Konteks
Stack: {blueprint.summary}
Sudah ada di proyek: {codeState.fileTree diringkas, maks 40 baris}

### Boleh disentuh
{allowedFiles}

### JANGAN sentuh
{forbiddenFiles}

### Spec terkait
{story.narrative}
{acceptanceCriteria}
{entitas yang disebut, hanya field-nya}
{ADR yang membatasi, hanya kalimat choice-nya}

### Definition of done
{definitionOfDone}

### Jangan lakukan
{nonGoals yang relevan, maks 5}
{deviasi dari CodeState terakhir yang belum diselesaikan}
```

Aturan keras:
- Tidak pernah memuat seluruh PRD
- Tidak pernah memuat story yang tidak tertaut ke task ini
- Total di bawah 1500 token. Kalau lebih, potong bagian file tree dulu.

Nilai produk ada di apa yang **tidak** dimasukkan. Godaan terbesar saat debugging
adalah menambah konteks; lawan itu.

---

## Credit

Nilai awal untuk seed `CreditRule`:

| ActionType | Credit |
|---|---|
| INTERVIEW | 0 |
| COMPILE_SPEC | 10 |
| CRITIC_PASS | 0 (termasuk dalam COMPILE_SPEC) |
| GENERATE_TASKS | 0 (termasuk) |
| SPLIT_TASK | 1 |
| PROMPT_PACKET | 0 |
| PASTE_BACK | 0 |
| REFINE_SECTION | 1 |
| CHANGE_REQUEST | 3 |

COMPILE_SPEC dipotong sekali di awal job dan dikembalikan penuh kalau job gagal.

Tiga pengaman, semuanya wajib ada sebelum rilis:
1. `monthlyCostCapUsd` per org, memicu notifikasi ke admin saat tertembus
2. Rate limit 20 aksi berbayar per jam per org
3. Batas ukuran proyek: 30 entitas, 60 task. Lewat batas berarti tolak dengan
   pesan yang menjelaskan kenapa

Angka-angka ini tebakan. Setelah 50 user pertama, kalibrasi dari `UsageLog`
tanpa deploy ulang.
