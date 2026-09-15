import type { InterviewQuestion } from "../types";

export const saasCrudTree: InterviewQuestion[] = [
  { slot: "appName", prompt: "Nama produk atau working title-nya apa?", type: "text", required: true },
  { slot: "targetUser", prompt: "Siapa yang akan pakai aplikasi ini?", type: "text", required: true },
  { slot: "coreProblem", prompt: "Masalah apa yang mau diselesaikan?", type: "text", required: true },
  {
    slot: "mainEntities",
    prompt: "Sebutkan 3-5 hal utama yang dikelola aplikasi ini (contoh: customer, invoice, order).",
    type: "text",
    required: true,
  },
  { slot: "needsAuth", prompt: "Butuh sistem login/akun user?", type: "boolean", required: true },
  {
    slot: "authProviders",
    prompt: "Cara login yang diinginkan?",
    type: "single-select",
    options: ["Email/Password", "Google", "Keduanya"],
    required: true,
    when: (a) => a.needsAuth === true,
  },
  {
    slot: "multiTenant",
    prompt: "Apakah tiap user/organisasi punya data terpisah (multi-tenant), atau semua data shared?",
    type: "boolean",
    required: true,
  },
  { slot: "needsBilling", prompt: "Butuh sistem pembayaran atau langganan?", type: "boolean", required: true },
  {
    slot: "billingModel",
    prompt: "Model bisnisnya apa?",
    type: "single-select",
    options: ["Subscription", "One-time", "Usage-based"],
    required: true,
    when: (a) => a.needsBilling === true,
  },
  {
    slot: "keyWorkflow",
    prompt: "Ceritakan alur utama user dari masuk sampai selesai satu task.",
    type: "text",
    required: true,
  },
  {
    slot: "mustHaveFeatures",
    prompt: "3 fitur yang WAJIB ada di versi pertama?",
    type: "text",
    required: true,
  },
  {
    slot: "explicitNonGoals",
    prompt: "Ada fitur yang SENGAJA tidak mau dibangun dulu?",
    type: "text",
    required: false,
  },
];
