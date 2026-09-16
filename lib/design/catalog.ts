export interface DesignStyle {
  id: string;
  name: string;
  summary: string;
}

export const DESIGN_STYLE_CATALOG: DesignStyle[] = [
  {
    id: "minimal-modern",
    name: "Minimalis modern (ala Apple/Linear)",
    summary:
      "Whitespace luas, palet netral (putih/abu/hitam) dengan sedikit warna aksen, tipografi tegas, animasi halus, komponen flat tanpa bayangan berlebih.",
  },
  {
    id: "playful",
    name: "Playful & colorful",
    summary: "Warna cerah dan kontras, rounded corner besar, ilustrasi/emoji, nada santai dan ramah.",
  },
  {
    id: "corporate",
    name: "Profesional / corporate (ala enterprise SaaS)",
    summary: "Palet biru-abu netral, layout terstruktur dan padat data, dashboard-first, minim dekorasi.",
  },
  {
    id: "dev-tool",
    name: "Dark mode-first / developer tool (ala Vercel/GitHub)",
    summary: "Dark background sebagai default, aksen monospace, information-dense, teknikal.",
  },
];
