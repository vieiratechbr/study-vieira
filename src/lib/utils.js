// ─────────────────────────────────────────────────────────────────────────────
//  lib/utils.js
//  Funções utilitárias compartilhadas
// ─────────────────────────────────────────────────────────────────────────────

export const uid     = () => Math.random().toString(36).slice(2, 10);
export const today   = () => new Date().toISOString().slice(0, 10);

export const fmt = (d) =>
  new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

export const fmtLong = (d) =>
  new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

export const fmtTimestamp = (ts) =>
  new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

export const fmtDateTime = (ts) =>
  new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
};
