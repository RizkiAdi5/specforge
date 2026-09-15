# 04 — Urutan build

Kerjakan berurutan. Tiap task punya definition of done yang bisa dicek.

## M-01 Fondasi

**T-001 Setup proyek**
Next.js 15 App Router, TypeScript strict, Tailwind, shadcn/ui, Prisma, Zod.
DoD: `pnpm build` lulus, `/` merender halaman kosong.

**T-002 Skema database**
Salin `prisma/schema.prisma` yang sudah disediakan. Migrasi jalan.
DoD: `prisma migrate dev` sukses, semua tabel ada, seed `CreditRule` terisi
dengan nilai dari `03-ai-pipeline.md`.

**T-003 Auth + org**
Clerk. Setiap user baru otomatis mendapat satu Org dengan Membership OWNER dan
plan FREE.
DoD: daftar akun baru menghasilkan Org dengan `creditBalance = 10` dan
`projectSlotMax = 1`.

**T-004 Provider abstraction**
`lib/ai/provider.ts` dengan satu implementasi DeepSeek lewat endpoint kompatibel
OpenAI. `lib/ai/run.ts` sesuai kontrak di `03-ai-pipeline.md`.
DoD: unit test memanggil dengan schema sederhana, output tervalidasi Zod,
`UsageLog` tertulis, credit terpotong, retry jalan saat JSON rusak.
Jangan lanjut sebelum ini benar. Semua tahap berikutnya bergantung padanya.

**T-005 Inngest**
Klien Inngest terpasang, satu job dummy berjalan dan menyiarkan progres ke UI.
DoD: halaman uji menampilkan progres tiga langkah secara langsung.

## M-02 Wawancara sampai brief

**T-006 Pohon pertanyaan SAAS_CRUD**
`lib/interview/trees/saas-crud.ts`. Slot wajib, percabangan, batas 15 pertanyaan.
Satu arketipe dulu, sisanya belakangan.
DoD: fungsi murni yang menerima jawaban sejauh ini dan mengembalikan pertanyaan
berikutnya atau sinyal selesai. Ada test untuk 3 jalur berbeda.

**T-007 UI wawancara**
Satu pertanyaan per layar, progress bar, bisa dilanjut setelah ditinggal.
DoD: US-001 semua acceptance criteria lulus.

**T-008 Job compile.brief**
Sesuai schema di `03-ai-pipeline.md`.
DoD: brief tersimpan, asumsi masuk tabel `Assumption` berstatus OPEN.

**T-009 Layar brief + approve**
Field bisa diedit, asumsi ditandai jelas, approve mengunci.
DoD: US-002 lulus.

## M-03 Compile spec

**T-010 domain**
**T-011 stories**
**T-012 decisions + blueprint catalog**
Blueprint ditulis manual sebagai JSON statis di `lib/blueprints/`. Minimal 3
stack yang benar-benar dipahami.
**T-013 critic pass**
**T-014 tasks + validasi graf asiklik**
**T-015 tracelinks (tanpa LLM)**

DoD tiap task: output lulus Zod, refId ternomor benar, dan validasi silang
antar tahap lulus.

**T-016 Orkestrasi + UI progres**
Merangkai T-010 sampai T-015 sebagai satu job Inngest berurutan dengan gerbang.
DoD: US-003 lulus, kegagalan mengembalikan credit dan status proyek.

## M-04 Task board & prompt

**T-017 Task board**
Tree view, status kunci dependensi, task siap kerja di atas.
DoD: US-007 lulus.

**T-018 Prompt packet assembler**
Template + pengumpulan konteks + pemotongan ke bawah 1500 token.
DoD: US-008 lulus. Test membuktikan packet tidak memuat story yang tidak tertaut.

**T-019 Gerbang asumsi**
DoD: US-013 lulus.

**T-020 Split task**
DoD: US-009 lulus, induk otomatis DONE saat semua step DONE.

**T-021 Status task + propagasi**
DoD: US-010 lulus.

## M-05 Billing

**T-022 Lemon Squeezy + webhook**
DoD: upgrade mengubah plan, slot, dan credit. Webhook idempoten.

**T-023 UI credit + peringatan**
DoD: US-014 lulus.

**T-024 BYOK**
Envelope encryption, validasi saat disimpan, hanya hint yang tampil.
DoD: US-015 lulus. Test membuktikan plaintext tidak pernah keluar dari server.

**T-025 Pengaman biaya**
Cost cap, rate limit, batas ukuran proyek.
DoD: ketiganya menolak dengan pesan yang menjelaskan, bukan error 500.

## M-06 Loop

**T-026 Paste-back + deteksi deviasi**
DoD: US-011 lulus.

**T-027 Change request + impact analyzer**
Traversal graf tanpa LLM. LLM hanya memetakan deskripsi ke refId awal.
DoD: US-012 lulus. Test dengan graf buatan membuktikan traversal menemukan semua
simpul terhubung dan berhenti.

**T-028 Regenerasi parsial + penandaan packet basi**
DoD: hanya artefak di `impactSet` berubah, packet yang beririsan jadi stale.

**T-029 Refine + edit manual**
DoD: US-005 dan US-006 lulus.

## M-07 Rilis

**T-030 Export ZIP**
DoD: US-016 lulus.

**T-031 Demo proyek**
Satu proyek contoh yang sudah jadi, bisa diklik tanpa daftar, read-only.
DoD: pengunjung bisa membuka task board dan melihat isi paket prompt.

**T-032 Landing page**
Satu segmen: solo vibecoder. Jangan menyebut agency.

**T-033 Dashboard biaya internal**
Biaya per user, per proyek, per action type, dari `UsageLog`.
DoD: bisa menjawab "aksi mana yang paling boros bulan ini".

---

## Urutan yang tidak boleh ditukar

- T-004 sebelum semua tahap pipeline. Kalau `run()` salah, semua ikut salah.
- T-015 sebelum T-027. Impact analyzer tidak berarti tanpa tracelink.
- T-025 sebelum rilis publik apa pun, termasuk beta tertutup.

## Yang sengaja tidak ada di daftar ini

Arketipe selain SAAS_CRUD, GitHub App, verifikasi DoD otomatis, mode tim, share
link klien. Semuanya fase 3. Skema sudah menyiapkan tempatnya.
