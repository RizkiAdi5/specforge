export interface Blueprint {
  id: string;
  name: string;
  summary: string;
  stack: string[];
  whenToUse: string;
}

export const BLUEPRINT_CATALOG: Blueprint[] = [
  {
    id: "nextjs-prisma-postgres",
    name: "Next.js + Prisma + PostgreSQL",
    summary: "Next.js App Router (TS) + Prisma + PostgreSQL + Clerk + Tailwind, satu repo full-stack",
    stack: ["Next.js 15 App Router", "TypeScript", "Prisma ORM", "PostgreSQL", "Clerk (auth)", "Tailwind CSS"],
    whenToUse:
      "Default untuk kebanyakan SaaS CRUD: butuh kontrol penuh atas schema database dan auth custom, tim nyaman dengan satu framework full-stack.",
  },
  {
    id: "nextjs-supabase",
    name: "Next.js + Supabase",
    summary: "Next.js App Router (TS) + Supabase (Postgres, Auth, Storage) + Tailwind",
    stack: ["Next.js 15 App Router", "TypeScript", "Supabase (Postgres + Auth + Storage)", "Tailwind CSS"],
    whenToUse:
      "Cocok kalau ingin auth dan file storage siap pakai tanpa menulis banyak backend, dan tim nyaman memanggil Supabase client langsung dari sisi klien.",
  },
  {
    id: "remix-prisma-postgres",
    name: "Remix + Prisma + PostgreSQL",
    summary: "Remix + Prisma + PostgreSQL + Tailwind",
    stack: ["Remix", "TypeScript", "Prisma ORM", "PostgreSQL", "Tailwind CSS"],
    whenToUse:
      "Cocok kalau tim lebih suka model data-loading Remix (loader/action per route) dibanding App Router Server Components.",
  },
  {
    id: "laravel-livewire-mysql",
    name: "Laravel + Livewire + MySQL",
    summary: "Laravel + Livewire + MySQL + Blade + Tailwind, server-rendered PHP full-stack",
    stack: ["Laravel", "PHP", "Livewire", "Blade", "Eloquent ORM", "MySQL", "Tailwind CSS"],
    whenToUse:
      "Cocok buat yang lebih nyaman di ekosistem PHP, atau mau UI interaktif tanpa nulis API terpisah — Livewire menangani state di server, minim JavaScript custom.",
  },
  {
    id: "rails-postgres",
    name: "Ruby on Rails + PostgreSQL",
    summary: "Ruby on Rails + PostgreSQL + Hotwire (Turbo + Stimulus) + Tailwind",
    stack: ["Ruby on Rails", "Ruby", "Active Record", "PostgreSQL", "Hotwire (Turbo + Stimulus)", "Tailwind CSS"],
    whenToUse:
      "Rails dirancang khusus buat CRUD cepat (scaffolding, convention over configuration) — cocok kalau prioritasnya kecepatan development dibanding kontrol granular.",
  },
  {
    id: "django-postgres",
    name: "Django + PostgreSQL",
    summary: "Django + PostgreSQL + Django ORM + Django Admin + Tailwind (django-tailwind)",
    stack: ["Django", "Python", "Django ORM", "PostgreSQL", "Django Admin", "Tailwind CSS"],
    whenToUse:
      "Cocok kalau tim lebih nyaman Python, atau butuh admin panel CRUD siap pakai dari awal (Django Admin) tanpa harus membangunnya sendiri.",
  },
];
