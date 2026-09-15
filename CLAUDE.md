# SpecForge — aturan kerja

Platform web yang mengubah keinginan kasar user jadi spec terstruktur, memecahnya
jadi task, lalu menyuapkan paket konteks per task ke AI coding tool mereka.

Baca `.spec/` sebelum mengerjakan apa pun. Urutan: 01 (produk) → 02 (data) →
03 (pipeline AI) → 04 (urutan build).

## Stack (jangan diganti tanpa alasan tertulis di ADR)

- Next.js 15 App Router, TypeScript strict
- PostgreSQL + Prisma
- Auth: Clerk
- Queue: Inngest (semua job AI wajib lewat sini, bukan request-response)
- LLM: DeepSeek via provider abstraction layer
- Billing: Lemon Squeezy
- UI: Tailwind + shadcn/ui
- Validasi: Zod di semua boundary

## Aturan keras

1. **Jangan pernah panggil LLM langsung dari route handler.** Semua lewat
   `lib/ai/run.ts` supaya usage tercatat dan credit terpotong.
2. **Setiap output LLM divalidasi Zod sebelum dipakai.** Gagal validasi berarti
   retry dengan pesan error, bukan diteruskan.
3. **Artefak punya dua identitas:** `id` (cuid, untuk DB) dan `refId`
   (`US-012`, untuk dokumen dan prompt). Jangan campur.
4. **Tidak ada FK langsung antar artefak spec.** Keterkaitan hidup di tabel
   `TraceLink`.
5. **Bobot credit dibaca dari tabel `CreditRule`**, tidak pernah hardcode.
6. **Prompt packet dibuat saat task dibuka**, bukan saat proyek dibuat.

## NON-GOALS — jangan bangun ini

- CLI, VS Code extension, atau apa pun yang perlu diinstal user
- Eksekusi kode, sandbox, atau menjalankan test milik user
- Integrasi GitHub (ditunda ke fase 3)
- Fitur tim, seat, permission, share link klien (skema sudah siap, UI ditunda)
- Editor kode di dalam platform
- Chat bebas dengan AI — semua interaksi AI terikat pada aksi yang terdefinisi
- Dukungan multi-bahasa UI (Inggris saja dulu)

## Definition of done global

Setiap PR: type check lulus, Zod schema ada di boundary baru, tidak ada
`console.log` tersisa, dan aksi AI baru wajib punya entry di `ActionType` +
`CreditRule`.
