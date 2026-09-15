# 01 — PRD

## Masalah

Vibecoder mulai proyek dengan AI coding tool dan lancar sampai prompt ke-20.
Setelah itu konteks membengkak, agent menulis ulang file yang sudah jadi,
membuat fungsi duplikat, dan menambah fitur yang tidak diminta. Tidak ada satu
pun sumber kebenaran soal apa yang sedang dibangun.

Akar masalahnya bukan di awal proyek, tapi di tengah: tidak ada yang memotong
konteks jadi ukuran yang bisa dicerna agent, dan tidak ada yang mendeteksi saat
kode menyimpang dari niat awal.

## Target user

**Solo vibecoder.** Membangun side project atau produk kecil sendirian, memakai
Cursor atau Claude Code, bukan software engineer formal. Toleransi terhadap
proses rendah: lebih dari 10 pertanyaan di awal dan mereka menutup tab.

Bukan target untuk sekarang: agency, tim engineering, enterprise. Skema data
sudah menyiapkan `orgId` dan `role`, tapi tidak ada UI untuk itu di fase 1–2.

## Yang dijual

Bukan dokumen. Yang dijual adalah **antrian prompt yang selalu tahu kondisi
proyek terkini**, plus kemampuan menjawab "kalau saya ubah ini, apa saja yang
kena".

Positioning: menjaga AI tetap di jalur. Bukan menjamin kode benar — tanpa akses
repo, klaim itu tidak bisa ditepati.

## Scope fase 1–2

- Wawancara adaptif per arketipe aplikasi
- Compile spec: PRD, domain model, user story, ADR, asumsi
- Task graph bertingkat dengan status persisten
- Prompt packet per task, dibuat just-in-time
- Paste-back untuk update state kode dan deteksi deviasi
- Change request dengan analisis dampak
- Kuota berbasis credit, billing, BYOK opsional
- Export ZIP berisi `.spec/` + `CLAUDE.md`

## Non-goals

Lihat `CLAUDE.md`. Daftar itu mengikat.

---

## User stories

Format: `refId` — narasi, lalu acceptance criteria.

### Onboarding & proyek

**US-001** — Sebagai user baru, saya bisa membuat proyek dengan menjawab
pertanyaan singkat, supaya tidak perlu menulis spec dari nol.
- Given user menekan "New project", when memilih arketipe, then wawancara
  dimulai dengan pertanyaan pertama untuk arketipe itu
- Given wawancara berjalan, when user sudah menjawab cukup untuk mengisi semua
  slot wajib, then sistem berhenti bertanya walau belum mencapai 15 pertanyaan
- Given user berhenti di tengah, when kembali nanti, then wawancara lanjut dari
  pertanyaan terakhir
- Jumlah pertanyaan tidak boleh melebihi 15 pada `specLevel=standard`, 8 pada
  `lite`

**US-002** — Sebagai user, saya bisa melihat dan mengoreksi brief sebelum spec
dibuat, supaya asumsi yang salah tidak menyebar ke semua dokumen.
- Given wawancara selesai, when brief ditampilkan, then setiap poin hasil
  pengarangan sistem diberi penanda asumsi
- Given user mengedit field brief, when menekan approve, then compile berjalan
  memakai versi terkoreksi
- Given brief belum di-approve, then tombol compile nonaktif

**US-003** — Sebagai user, saya bisa melihat progres compile secara langsung,
supaya tidak menatap layar kosong selama satu menit.
- Given compile berjalan, when tiap tahap pipeline selesai, then UI menampilkan
  tahap yang sedang jalan
- Given satu tahap gagal setelah retry, then user melihat tahap mana yang gagal
  dan tombol coba lagi, dan credit tidak terpotong

### Spec

**US-004** — Sebagai user, saya bisa membaca spec proyek saya per bagian, supaya
tidak harus mencerna satu dokumen raksasa.
- Given proyek aktif, when membuka tab Spec, then PRD, domain, story, dan ADR
  muncul sebagai bagian terpisah
- Given satu entitas dibuka, then story dan task yang tertaut padanya ikut
  ditampilkan

**US-005** — Sebagai user, saya bisa memperbaiki satu bagian spec tanpa
menggenerate ulang semuanya.
- Given user menekan refine pada satu bagian, when memberi instruksi, then hanya
  bagian itu yang diregenerate
- Refine memotong 1 credit, regenerate proyek penuh tidak tersedia

**US-006** — Sebagai user, saya bisa mengedit langsung isi spec, supaya koreksi
kecil tidak perlu memanggil AI.
- Given user mengedit teks story, when menyimpan, then perubahan tersimpan tanpa
  memotong credit
- Given story diedit, then task yang tertaut ditandai perlu ditinjau

### Task & prompt

**US-007** — Sebagai user, saya bisa melihat task berikutnya yang siap
dikerjakan, supaya tidak bingung mulai dari mana.
- Given ada task dengan semua dependensi berstatus DONE, then task itu muncul di
  bagian atas board
- Given dependensi belum selesai, then task ditampilkan terkunci dengan alasan

**US-008** — Sebagai user, saya bisa menyalin paket prompt untuk satu task,
supaya bisa langsung ditempel ke AI coding tool.
- Given user membuka task, when menekan Copy prompt, then paket lengkap tersalin
  ke clipboard
- Paket berisi: konteks stack, file yang boleh disentuh, file terlarang, spec
  terkait yang relevan saja, definition of done, dan daftar larangan dari
  non-goals
- Paket tidak boleh memuat seluruh PRD
- Aksi ini tidak memotong credit

**US-009** — Sebagai user yang mentok, saya bisa memecah satu task jadi
langkah-langkah lebih kecil.
- Given task berlevel TASK, when user menekan Split, then 3–6 STEP dibuat di
  bawahnya memakai state kode terkini
- Given semua STEP berstatus DONE, then task induk otomatis DONE

**US-010** — Sebagai user, saya bisa menandai task selesai dan melihat apa
berikutnya.
- Given task ditandai DONE, then task yang dependensinya baru terpenuhi naik ke
  atas board

### Loop

**US-011** — Sebagai user, saya bisa menempel kondisi kode saya, supaya sistem
tahu apa yang sudah benar-benar ada.
- Given user menempel file tree atau isi file, when menekan Check, then sistem
  membandingkan dengan spec dan melaporkan deviasi
- Deviasi dilaporkan dengan path, alasan, dan tingkat keparahan
- Given ada file yang menyentuh area non-goals, then deviasi ditandai tinggi
- Aksi ini tidak memotong credit

**US-012** — Sebagai user, saya bisa mengajukan perubahan dan melihat dampaknya
sebelum diterapkan.
- Given user menulis change request, when analisis selesai, then sistem
  menampilkan jumlah entitas, story, dan task yang terdampak, termasuk task DONE
  yang jadi tidak valid
- Given user menyetujui, then hanya subgraf terdampak yang diregenerate
- Given user membatalkan, then tidak ada perubahan dan credit tetap terpotong
  untuk analisisnya

**US-013** — Sebagai user, saya menjawab asumsi saat asumsi itu relevan, bukan
di awal.
- Given user membuka task yang tertaut ke asumsi berstatus OPEN, then pertanyaan
  asumsi muncul sebelum prompt bisa disalin
- Given user menjawab, then asumsi jadi CONFIRMED dan jawabannya masuk ke paket
  prompt

### Akun

**US-014** — Sebagai user, saya bisa melihat sisa credit dan slot proyek saya.
- Given sisa credit di bawah 20%, then peringatan muncul di header
- Given credit habis, when mencoba aksi berbayar, then muncul pilihan upgrade
  atau top-up, bukan error

**US-015** — Sebagai user, saya bisa memakai API key DeepSeek sendiri.
- Given user memasukkan key, when disimpan, then key divalidasi dengan satu call
  kecil dan hanya ciphertext yang masuk database
- Given key aktif, then aksi berbayar tidak memotong credit
- Given key ditolak provider, then user diberi tahu sebelum job panjang dimulai

**US-016** — Sebagai user, saya bisa mengunduh spec saya sebagai file.
- Given user menekan Export, then ZIP berisi `.spec/*.md` dan `CLAUDE.md` terunduh
- Isi ZIP harus cocok dengan kondisi spec saat itu

---

## Layar

| Layar | Isi | Catatan |
|---|---|---|
| `/` | Landing + demo proyek yang bisa diklik tanpa daftar | Demo adalah alat jualan utama |
| `/projects` | Daftar proyek, slot terpakai, tombol New | |
| `/projects/new` | Pemilihan arketipe lalu wawancara satu pertanyaan per layar | Progress bar wajib |
| `/projects/[id]/brief` | Brief + penanda asumsi + tombol approve | Gerbang sebelum compile |
| `/projects/[id]` | Task board — layar utama, default landing setelah compile | |
| `/projects/[id]/tasks/[taskId]` | Detail task, paket prompt, tombol split, tombol done | |
| `/projects/[id]/spec` | Spec per bagian dengan tautan silang | |
| `/projects/[id]/changes` | Form change request + riwayat + tampilan dampak | |
| `/settings/billing` | Plan, sisa credit, riwayat pemakaian, top-up | |
| `/settings/keys` | BYOK, hanya menampilkan 4 karakter terakhir | |

Layar utama adalah task board, bukan viewer dokumen. Setelah compile selesai,
user diarahkan ke sana, bukan ke PRD.
