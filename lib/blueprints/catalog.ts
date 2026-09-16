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
];
