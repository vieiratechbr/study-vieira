// ─────────────────────────────────────────────────────────────────────────────
//  sounds/sfx.js
//  Engine de efeitos sonoros — Web Audio API, zero dependências externas
// ─────────────────────────────────────────────────────────────────────────────

let audioCtx = null;

const ac = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
};

/**
 * Toca um tom simples
 * @param {number} freq   - frequência em Hz
 * @param {number} dur    - duração em segundos
 * @param {string} type   - tipo de onda: 'sine' | 'square' | 'sawtooth' | 'triangle'
 * @param {number} vol    - volume de 0 a 1
 */
const tone = (freq, dur, type = 'sine', vol = 0.15) => {
  try {
    const ctx = ac();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur);
  } catch (e) {
    // Audio não disponível (ex: aba em segundo plano) — ignora silenciosamente
  }
};

// ── Sons do sistema ────────────────────────────────────────────────────────────
const SFX = {
  /** Troca de aba na navbar */
  tab: () => tone(520, 0.09, 'sine', 0.12),

  /** Clique genérico */
  click: () => tone(660, 0.07, 'sine', 0.10),

  /** Abrir modal / painel */
  open: () => {
    tone(440, 0.08, 'sine', 0.10);
    setTimeout(() => tone(550, 0.08, 'sine', 0.08), 60);
  },

  /** Fechar modal */
  close: () => {
    tone(550, 0.07, 'sine', 0.09);
    setTimeout(() => tone(400, 0.08, 'sine', 0.07), 55);
  },

  /** Salvar / criar item com sucesso */
  save: () => {
    tone(523, 0.07, 'sine', 0.12);
    setTimeout(() => tone(659, 0.10, 'sine', 0.10), 70);
    setTimeout(() => tone(784, 0.14, 'sine', 0.09), 150);
  },

  /** Erro de validação / login inválido */
  error: () => {
    tone(220, 0.12, 'sawtooth', 0.08);
    setTimeout(() => tone(180, 0.14, 'sawtooth', 0.07), 90);
  },

  /** Login / cadastro bem-sucedido */
  login: () => {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => tone(f, 0.12, 'sine', 0.11), i * 70)
    );
  },

  /** Alternar tema claro/escuro */
  toggle: (dark) => tone(dark ? 300 : 600, 0.10, 'sine', 0.10),

  /** Seguir / deixar de seguir alguém */
  follow: () => {
    tone(659, 0.08, 'sine', 0.12);
    setTimeout(() => tone(880, 0.12, 'sine', 0.10), 70);
  },

  /** Banir usuário */
  ban: () => {
    tone(150, 0.20, 'sawtooth', 0.14);
    setTimeout(() => tone(100, 0.25, 'sawtooth', 0.10), 180);
  },
};

export default SFX;
