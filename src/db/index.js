// ─────────────────────────────────────────────────────────────────────────────
//  db/index.js
//  Interface unificada — usa Supabase em produção, localStorage em dev
// ─────────────────────────────────────────────────────────────────────────────

export * from './localStorage.js';
export * from './supabase.js';

export const USE_SUPABASE = !!(
  typeof import.meta !== 'undefined' &&
  import.meta.env?.VITE_SUPABASE_URL
);
