// ─────────────────────────────────────────────────────────────────────────────
//  lib/constants.js
//  Constantes compartilhadas por toda a aplicação
// ─────────────────────────────────────────────────────────────────────────────

export const FOUNDER      = "admin@studyvieira.com";
export const FOUNDER_PASS = "SV@Admin2025!";
export const FOUNDER_ID   = "sv_founder_001";

export const COLORS = [
  { id: "sky",    dot: "#7dd3fc", glow: "rgba(125,211,252,0.45)", tint: "rgba(125,211,252,0.08)" },
  { id: "violet", dot: "#c4b5fd", glow: "rgba(196,181,253,0.45)", tint: "rgba(196,181,253,0.08)" },
  { id: "rose",   dot: "#fda4af", glow: "rgba(253,164,175,0.45)", tint: "rgba(253,164,175,0.08)" },
  { id: "amber",  dot: "#fcd34d", glow: "rgba(252,211,77,0.45)",  tint: "rgba(252,211,77,0.06)"  },
  { id: "teal",   dot: "#5eead4", glow: "rgba(94,234,212,0.45)",  tint: "rgba(94,234,212,0.06)"  },
  { id: "indigo", dot: "#a5b4fc", glow: "rgba(165,180,252,0.45)", tint: "rgba(165,180,252,0.08)" },
  { id: "sage",   dot: "#86efac", glow: "rgba(134,239,172,0.45)", tint: "rgba(134,239,172,0.06)" },
  { id: "slate",  dot: "#cbd5e1", glow: "rgba(203,213,225,0.35)", tint: "rgba(203,213,225,0.05)" },
];

export const CONTENT_TYPES = [
  { v: "aula",      l: "Aula",       icon: "📖" },
  { v: "revisao",   l: "Revisão",    icon: "🔄" },
  { v: "exercicio", l: "Exercício",  icon: "✏️" },
  { v: "video",     l: "Vídeo",      icon: "🎬" },
  { v: "leitura",   l: "Leitura",    icon: "📄" },
];
export const getContentType = (v) => CONTENT_TYPES.find(t => t.v === v) || CONTENT_TYPES[0];

export const POST_TAGS = ["Aviso", "Prova", "Evento", "Notícia", "Importante"];
export const POST_TAG_COLORS = {
  Aviso:      "#7dd3fc",
  Prova:      "#fda4af",
  Evento:     "#a5b4fc",
  "Notícia":  "#86efac",
  Importante: "#fcd34d",
};

export const COMMUNITY_TYPES = ["Escola", "Universidade", "Cursinho", "Faculdade", "Instituto", "Outro"];
export const COMMUNITY_ICONS = ["🏫", "🎓", "📚", "🏛️", "⚗️", "🖥️", "🎨", "🏋️", "⚽", "🎸"];

export const BAN_DURATIONS = [
  { label: "3 dias",                    ms: 3  * 24 * 60 * 60 * 1000 },
  { label: "7 dias",                    ms: 7  * 24 * 60 * 60 * 1000 },
  { label: "30 dias",                   ms: 30 * 24 * 60 * 60 * 1000 },
  { label: "Conta inativa (indefinido)", ms: 0 },
];

export const BANNER_COLORS = [
  "linear-gradient(135deg, #374151, #1f2937)",
  "linear-gradient(135deg, #1e3a5f, #0f2847)",
  "linear-gradient(135deg, #2d1b4e, #1a0f30)",
  "linear-gradient(135deg, #1a3320, #0d1f14)",
  "linear-gradient(135deg, #3d2020, #231212)",
];
export const getBanner = (userId) =>
  BANNER_COLORS[userId?.charCodeAt(0) % BANNER_COLORS.length] || BANNER_COLORS[0];
