/* ============================================================
   O Professor — Widget para Study Vieira
   Herda automaticamente o design system (dark/light/donor)
   ============================================================ */
(function () {
  if (document.getElementById('op-widget-root')) return;

  const style = document.createElement('style');
  style.id = 'op-widget-styles';
  style.textContent = `
    #op-fab {
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      width: 54px; height: 54px; border-radius: 50%;
      background: linear-gradient(135deg, #7dd3fc, #c4b5fd);
      border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px;
      box-shadow: 0 4px 24px rgba(125,211,252,0.35), 0 2px 8px rgba(0,0,0,0.3);
      transition: transform .22s cubic-bezier(.34,1.56,.64,1), box-shadow .2s;
    }
    #op-fab:hover {
      transform: scale(1.10);
      box-shadow: 0 6px 32px rgba(125,211,252,0.5), 0 2px 10px rgba(0,0,0,0.35);
    }
    #op-fab:active { transform: scale(0.95); }
    #op-fab .op-ico { transition: transform .25s, opacity .2s; display: block; }
    #op-fab.open .op-ico { transform: rotate(90deg); opacity: .8; }

    #op-overlay {
      position: fixed; inset: 0; z-index: 9998;
      background: rgba(0,0,0,0);
      pointer-events: none;
      transition: background .3s ease;
      backdrop-filter: blur(0px);
      -webkit-backdrop-filter: blur(0px);
    }
    #op-overlay.open {
      background: rgba(0,0,0,0.55);
      pointer-events: auto;
      backdrop-filter: blur(3px);
      -webkit-backdrop-filter: blur(3px);
    }

    #op-popup {
      position: fixed;
      bottom: 88px; right: 24px; z-index: 9999;
      width: 400px;
      height: 580px;
      display: flex; flex-direction: column;
      overflow: hidden;
      font-family: 'Figtree', -apple-system, BlinkMacSystemFont, sans-serif;
      /* Glass — usa as mesmas vars do site */
      background: var(--s, rgba(72,72,74,0.55));
      backdrop-filter: blur(var(--blur, 32px)) saturate(160%) brightness(1.04);
      -webkit-backdrop-filter: blur(var(--blur, 32px)) saturate(160%) brightness(1.04);
      border: 1px solid var(--b, rgba(255,255,255,0.13));
      border-radius: var(--r, 20px);
      box-shadow:
        0 1px 0 var(--shine, rgba(255,255,255,0.18)) inset,
        0 -1px 0 rgba(0,0,0,0.12) inset,
        0 20px 60px rgba(0,0,0,0.4),
        0 2px 8px rgba(0,0,0,0.2);
      transform: scale(0.92) translateY(18px);
      opacity: 0; pointer-events: none;
      transition: transform .3s cubic-bezier(.34,1.56,.64,1), opacity .22s ease;
    }
    /* Gloss edge — idêntico ao .glass do site */
    #op-popup::before {
      content: '';
      position: absolute; top: 0; left: 8%; right: 8%; height: 1px;
      background: linear-gradient(90deg, transparent, var(--shine, rgba(255,255,255,0.18)) 40%, var(--shine, rgba(255,255,255,0.18)) 60%, transparent);
      pointer-events: none; z-index: 2;
    }
    #op-popup.open {
      transform: scale(1) translateY(0);
      opacity: 1; pointer-events: auto;
    }

    /* ── Header ── */
    .op-top {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 16px;
      border-bottom: 1px solid var(--b2, rgba(255,255,255,0.07));
      flex-shrink: 0;
    }
    .op-brand { display: flex; align-items: center; gap: 9px; }
    .op-orb {
      width: 30px; height: 30px; border-radius: 50%;
      background: linear-gradient(135deg, #7dd3fc, #c4b5fd);
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; flex-shrink: 0;
      box-shadow: 0 0 12px rgba(125,211,252,0.3);
    }
    .op-brand-name {
      font-size: 14px; font-weight: 600;
      color: var(--t, rgba(255,255,255,0.92));
    }
    .op-brand-sub {
      font-size: 11px; color: var(--t2, rgba(255,255,255,0.52));
    }
    .op-btns { display: flex; gap: 6px; align-items: center; }
    .op-btn {
      padding: 4px 10px; border-radius: 8px; font-size: 11px;
      background: var(--card-bg, rgba(255,255,255,0.04));
      border: 1px solid var(--b2, rgba(255,255,255,0.07));
      color: var(--t2, rgba(255,255,255,0.52));
      cursor: pointer; font-family: inherit; transition: all .15s;
    }
    .op-btn:hover { color: #fda4af; border-color: rgba(253,164,175,0.35); background: rgba(253,164,175,0.08); }
    .op-btn-x {
      width: 24px; height: 24px; border-radius: 50%; padding: 0;
      display: flex; align-items: center; justify-content: center; font-size: 13px;
    }
    .op-btn-x:hover { color: #fda4af; border-color: rgba(253,164,175,0.35); background: rgba(253,164,175,0.08); }

    /* ── Messages ── */
    .op-msgs {
      flex: 1; overflow-y: auto; min-height: 0;
      padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;
      scrollbar-width: thin;
      scrollbar-color: var(--b, rgba(255,255,255,0.13)) transparent;
    }
    .op-msgs::-webkit-scrollbar { width: 3px; }
    .op-msgs::-webkit-scrollbar-thumb { background: var(--b, rgba(255,255,255,0.13)); border-radius: 4px; }

    .op-m { display: flex; gap: 7px; }
    .op-m.user { flex-direction: row-reverse; align-self: flex-end; }
    .op-m.bot  { align-self: flex-start; }
    .op-av {
      width: 24px; height: 24px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 600; flex-shrink: 0; margin-top: 2px;
    }
    .op-m.user .op-av { background: linear-gradient(135deg,#7dd3fc,#c4b5fd); color: rgba(0,0,0,0.8); font-size: 11px; }
    .op-m.bot  .op-av {
      background: var(--card-bg, rgba(255,255,255,0.04));
      color: #7dd3fc;
      border: 1px solid var(--b, rgba(255,255,255,0.13));
      font-size: 14px;
    }

    .op-bub {
      padding: 9px 13px; border-radius: 14px;
      font-size: 13px; line-height: 1.65; max-width: 280px;
      color: var(--t, rgba(255,255,255,0.92));
    }
    .op-m.user .op-bub {
      background: linear-gradient(135deg, rgba(125,211,252,0.18), rgba(196,181,253,0.14));
      border: 1px solid rgba(125,211,252,0.22);
      border-bottom-right-radius: 4px;
    }
    .op-m.bot .op-bub {
      background: var(--card-bg, rgba(255,255,255,0.04));
      border: 1px solid var(--b, rgba(255,255,255,0.13));
      border-bottom-left-radius: 4px;
    }
    .op-bub p { margin-bottom: 5px; }
    .op-bub p:last-child { margin-bottom: 0; }
    .op-bub strong { font-weight: 600; color: #7dd3fc; }
    .op-bub em { font-style: italic; color: var(--t2, rgba(255,255,255,0.52)); }
    .op-bub h3 { font-size: 13px; font-weight: 600; color: #7dd3fc; margin: 6px 0 3px; }
    .op-bub h3:first-child { margin-top: 0; }
    .op-bub ul, .op-bub ol { padding-left: 16px; margin: 3px 0; }
    .op-bub li { margin-bottom: 2px; font-size: 12.5px; }
    .op-bub code {
      background: rgba(125,211,252,0.12); color: #7dd3fc;
      padding: 1px 5px; border-radius: 4px; font-size: 11.5px; font-family: monospace;
    }
    .op-bub pre {
      background: rgba(0,0,0,0.3);
      border: 1px solid var(--b, rgba(255,255,255,0.13));
      padding: 9px; border-radius: 8px; overflow-x: auto;
      font-size: 11.5px; margin: 5px 0; position: relative;
    }
    .op-bub pre code { background: none; padding: 0; color: #a5b4fc; }
    .op-copy {
      position: absolute; top: 5px; right: 5px;
      font-size: 10px; padding: 2px 7px; border-radius: 4px;
      background: var(--s, rgba(72,72,74,0.55));
      border: 1px solid var(--b, rgba(255,255,255,0.13));
      color: var(--t2, rgba(255,255,255,0.52));
      cursor: pointer; font-family: inherit;
    }
    .op-bub .op-msg-img {
      max-width: 220px; max-height: 140px; border-radius: 8px;
      display: block; margin-bottom: 5px;
      border: 1px solid var(--b, rgba(255,255,255,0.13));
    }
    .op-bub .op-pdf-tag {
      display: inline-flex; align-items: center; gap: 5px;
      background: rgba(253,164,175,0.1); border: 1px solid rgba(253,164,175,0.2);
      color: #fda4af; font-size: 11px; padding: 3px 8px;
      border-radius: 7px; margin-bottom: 5px;
    }

    /* ── Indicators ── */
    .op-typing { display: flex; gap: 4px; align-items: center; }
    .op-typing span {
      width: 6px; height: 6px; border-radius: 50%; background: #7dd3fc;
      animation: optp 1.2s infinite; opacity: .4;
    }
    .op-typing span:nth-child(2) { animation-delay: .2s; }
    .op-typing span:nth-child(3) { animation-delay: .4s; }
    @keyframes optp { 0%,80%,100%{transform:scale(1);opacity:.4} 40%{transform:scale(1.3);opacity:1} }
    .op-searching {
      display: flex; align-items: center; gap: 7px;
      font-size: 11.5px; color: #a5b4fc;
    }
    .op-spin {
      width: 12px; height: 12px; border-radius: 50%;
      border: 1.5px solid rgba(165,180,252,0.2); border-top-color: #a5b4fc;
      animation: opspin .7s linear infinite; flex-shrink: 0;
    }
    @keyframes opspin { to { transform: rotate(360deg); } }
    .op-reading { color: #fda4af; }
    .op-reading .op-spin { border-color: rgba(253,164,175,0.2); border-top-color: #fda4af; }

    /* ── Welcome ── */
    .op-welcome { text-align: center; padding: 28px 12px; }
    .op-welcome-glyph { font-size: 28px; margin-bottom: 10px; }
    .op-welcome h3 { font-size: 15px; font-weight: 700; color: var(--t, rgba(255,255,255,0.92)); margin-bottom: 5px; }
    .op-welcome p { font-size: 12.5px; color: var(--t2, rgba(255,255,255,0.52)); line-height: 1.7; }

    /* ── File preview ── */
    .op-fp {
      display: none; align-items: center; gap: 8px;
      padding: 7px 14px;
      border-top: 1px solid var(--b2, rgba(255,255,255,0.07));
      background: var(--card-bg, rgba(255,255,255,0.04));
      flex-shrink: 0;
    }
    .op-fp.show { display: flex; }
    .op-fp-thumb { width: 32px; height: 32px; object-fit: cover; border-radius: 6px; display: none; border: 1px solid var(--b, rgba(255,255,255,0.13)); }
    .op-fp-thumb.show { display: block; }
    .op-fp-pdf {
      width: 32px; height: 32px; border-radius: 6px;
      background: rgba(253,164,175,0.12); border: 1px solid rgba(253,164,175,0.2);
      display: none; align-items: center; justify-content: center;
      font-size: 15px; flex-shrink: 0;
    }
    .op-fp-pdf.show { display: flex; }
    .op-fp-name { font-size: 12px; color: var(--t2, rgba(255,255,255,0.52)); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .op-fp-rm {
      width: 20px; height: 20px; border-radius: 50%;
      background: var(--card-bg, rgba(255,255,255,0.04));
      border: 1px solid var(--b, rgba(255,255,255,0.13));
      color: var(--t2, rgba(255,255,255,0.52));
      cursor: pointer; font-size: 12px;
      display: flex; align-items: center; justify-content: center;
      transition: all .15s; flex-shrink: 0; font-family: inherit;
    }
    .op-fp-rm:hover { color: #fda4af; border-color: rgba(253,164,175,0.35); }

    /* ── Input ── */
    .op-in {
      padding: 11px 14px;
      border-top: 1px solid var(--b2, rgba(255,255,255,0.07));
      display: flex; gap: 7px; align-items: flex-end; flex-shrink: 0;
    }
    .op-attach {
      width: 32px; height: 32px; border-radius: 9px;
      background: var(--card-bg, rgba(255,255,255,0.04));
      border: 1px solid var(--b, rgba(255,255,255,0.13));
      color: var(--t2, rgba(255,255,255,0.52));
      cursor: pointer; font-size: 15px;
      display: flex; align-items: center; justify-content: center;
      transition: all .15s; flex-shrink: 0;
    }
    .op-attach:hover { border-color: rgba(125,211,252,0.4); color: #7dd3fc; background: rgba(125,211,252,0.08); }
    .op-ta {
      flex: 1; resize: none;
      background: var(--inp-bg, rgba(255,255,255,0.06));
      border: 1px solid var(--b, rgba(255,255,255,0.13));
      border-radius: 10px; padding: 8px 12px;
      font-size: 13px; font-family: 'Figtree', -apple-system, sans-serif;
      color: var(--t, rgba(255,255,255,0.92));
      line-height: 1.5; outline: none;
      max-height: 90px; overflow-y: auto; transition: border-color .15s;
    }
    .op-ta::placeholder { color: var(--t3, rgba(255,255,255,0.26)); }
    .op-ta:focus { border-color: rgba(125,211,252,0.4); background: var(--inp-focus, rgba(255,255,255,0.09)); }
    .op-send {
      width: 32px; height: 32px; border-radius: 9px;
      background: linear-gradient(135deg, #7dd3fc, #c4b5fd);
      border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: all .15s;
      box-shadow: 0 0 10px rgba(125,211,252,0.2);
    }
    .op-send:hover { filter: brightness(1.1); box-shadow: 0 0 16px rgba(125,211,252,0.35); }
    .op-send:active { transform: scale(.93); }
    .op-send:disabled { background: var(--card-bg, rgba(255,255,255,0.04)); box-shadow: none; cursor: default; }
    .op-send svg { width: 14px; height: 14px; fill: rgba(0,0,0,0.8); }
  `;
  document.head.appendChild(style);

  document.body.insertAdjacentHTML('beforeend', `
    <div id="op-overlay"></div>

    <button id="op-fab" title="O Professor — Assistente de estudos">
      <span class="op-ico">🎓</span>
    </button>

    <div id="op-popup">
      <div class="op-top">
        <div class="op-brand">
          <div class="op-orb">🎓</div>
          <div>
            <div class="op-brand-name">O Professor</div>
            <div class="op-brand-sub">Assistente inteligente</div>
          </div>
        </div>
        <div class="op-btns">
          <button class="op-btn" id="op-clear">🗑 Apagar</button>
          <button class="op-btn op-btn-x" id="op-close">✕</button>
        </div>
      </div>

      <div class="op-msgs" id="op-msgs">
        <div class="op-welcome">
          <div class="op-welcome-glyph">🎓</div>
          <h3>Oi, eu sou O Professor</h3>
          <p>O que vamos aprender hoje?</p>
        </div>
      </div>

      <div class="op-fp" id="op-fp">
        <img class="op-fp-thumb" id="op-fp-thumb" src="" alt="">
        <div class="op-fp-pdf" id="op-fp-pdf">📄</div>
        <div class="op-fp-name" id="op-fp-name"></div>
        <button class="op-fp-rm" id="op-fp-rm">✕</button>
      </div>

      <div class="op-in">
        <button class="op-attach" id="op-attach" title="Imagem ou PDF">📎</button>
        <input type="file" id="op-file-input" accept="image/*,.pdf" style="display:none">
        <textarea class="op-ta" id="op-ta" rows="1" placeholder="Pergunte qualquer coisa…"></textarea>
        <button class="op-send" id="op-send">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    </div>
  `);

  const SYS = `Você é "O Professor", um assistente educacional de elite integrado ao Study Vieira — um organizador de estudos. Você tem acesso à internet em tempo real e pode analisar imagens e PDFs.

Capacidades: explique qualquer matéria do ensino fundamental ao avançado, programe em qualquer linguagem com código completo e funcional, analise imagens e PDFs enviados, busque informações atuais quando necessário.

Seja conciso, didático e direto. Use markdown. Responda sempre em português do Brasil (exceto código).`;

  let hist = [], busy = false, pendingFile = null;
  let isOpen = false;

  const fab      = document.getElementById('op-fab');
  const popup    = document.getElementById('op-popup');
  const overlay  = document.getElementById('op-overlay');
  const msgs     = document.getElementById('op-msgs');
  const ta       = document.getElementById('op-ta');
  const sendBtn  = document.getElementById('op-send');
  const clearBtn = document.getElementById('op-clear');
  const closeBtn = document.getElementById('op-close');
  const attachBtn= document.getElementById('op-attach');
  const fileInp  = document.getElementById('op-file-input');
  const fp       = document.getElementById('op-fp');
  const fpThumb  = document.getElementById('op-fp-thumb');
  const fpPdf    = document.getElementById('op-fp-pdf');
  const fpName   = document.getElementById('op-fp-name');
  const fpRm     = document.getElementById('op-fp-rm');

  function toggle() {
    isOpen = !isOpen;
    popup.classList.toggle('open', isOpen);
    overlay.classList.toggle('open', isOpen);
    fab.classList.toggle('open', isOpen);
    if (isOpen) setTimeout(() => ta.focus(), 320);
  }

  fab.addEventListener('click', toggle);
  closeBtn.addEventListener('click', toggle);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) toggle(); });

  clearBtn.addEventListener('click', () => {
    hist = [];
    msgs.innerHTML = `<div class="op-welcome"><div class="op-welcome-glyph">🎓</div><h3>Oi, eu sou O Professor</h3><p>O que vamos aprender hoje?</p></div>`;
  });

  attachBtn.addEventListener('click', () => fileInp.click());
  fileInp.addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    e.target.value = '';
    const isPDF = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');
    if (!isPDF && !isImage) return alert('Envie uma imagem ou PDF.');
    if (file.size > 20 * 1024 * 1024) return alert('Máximo 20MB.');
    const reader = new FileReader();
    reader.onload = ev => {
      pendingFile = { type: isPDF ? 'pdf' : 'image', base64: ev.target.result.split(',')[1], mediaType: file.type, name: file.name };
      fpName.textContent = file.name;
      if (isPDF) { fpThumb.classList.remove('show'); fpPdf.classList.add('show'); }
      else { fpThumb.src = ev.target.result; fpThumb.classList.add('show'); fpPdf.classList.remove('show'); }
      fp.classList.add('show');
    };
    reader.readAsDataURL(file);
  });
  fpRm.addEventListener('click', clearFile);
  function clearFile() {
    pendingFile = null;
    fp.classList.remove('show');
    fpThumb.classList.remove('show');
    fpPdf.classList.remove('show');
  }

  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 90) + 'px'; });
  sendBtn.addEventListener('click', send);

  function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function mdRender(t) {
    return t
      .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, l, c) =>
        `<pre><button class="op-copy" onclick="(function(b){navigator.clipboard.writeText(b.nextElementSibling.textContent).then(()=>{b.textContent='✓';setTimeout(()=>b.textContent='copiar',1400)})})(this)">copiar</button><code>${esc(c.trim())}</code></pre>`)
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^#{1,3} (.+)$/gm, '<h3>$1</h3>')
      .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
      .replace(/(<li>[\s\S]+?<\/li>)/g, '<ul>$1</ul>')
      .replace(/<\/ul>\s*<ul>/g, '')
      .split('\n\n').map(p => p.startsWith('<') ? p : `<p>${p.replace(/\n/g,'<br>')}</p>`).join('');
  }

  function addMsg(role, txt, state = 'text', file = null) {
    const w = msgs.querySelector('.op-welcome'); if (w) w.remove();
    const wrap = document.createElement('div');
    wrap.className = `op-m ${role === 'user' ? 'user' : 'bot'}`;
    const av = document.createElement('div'); av.className = 'op-av';
    av.textContent = role === 'user' ? 'Eu' : '🎓';
    const b = document.createElement('div'); b.className = 'op-bub';

    if (state === 'dots') {
      b.innerHTML = '<div class="op-typing"><span></span><span></span><span></span></div>';
    } else if (state === 'search') {
      b.innerHTML = '<div class="op-searching"><div class="op-spin"></div>Buscando na internet…</div>';
    } else if (state === 'reading') {
      b.innerHTML = '<div class="op-searching op-reading"><div class="op-spin"></div>Lendo o arquivo…</div>';
    } else {
      let html = '';
      if (file) html += file.type === 'image'
        ? `<img class="op-msg-img" src="data:${file.mediaType};base64,${file.base64}" alt="">`
        : `<div class="op-pdf-tag">📄 ${esc(file.name)}</div>`;
      html += role === 'user' ? (txt ? `<p>${esc(txt)}</p>` : '') : mdRender(txt);
      b.innerHTML = html;
    }

    wrap.appendChild(av); wrap.appendChild(b);
    msgs.appendChild(wrap); msgs.scrollTop = msgs.scrollHeight;
    return b;
  }

  async function send() {
    if (busy) return;
    const txt = ta.value.trim();
    if (!txt && !pendingFile) return;
    ta.value = ''; ta.style.height = 'auto';
    const file = pendingFile; clearFile();

    addMsg('user', txt, 'text', file);

    const userContent = [];
    if (file) {
      if (file.type === 'image') userContent.push({ type: 'image', source: { type: 'base64', media_type: file.mediaType, data: file.base64 } });
      else userContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.base64 } });
    }
    if (txt) userContent.push({ type: 'text', text: txt });
    else userContent.push({ type: 'text', text: file.type === 'pdf' ? 'Leia este documento e me ajude.' : 'Analise esta imagem e me ajude.' });
    hist.push({ role: 'user', content: userContent });

    busy = true; sendBtn.disabled = true;
    const bub = addMsg('bot', '', file ? 'reading' : 'dots');

    try {
      const call = (messages) => fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          system: SYS,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages
        })
      }).then(r => r.json());

      let res = await call(hist);
      let loop = [...hist];

      while (res.stop_reason === 'tool_use') {
        bub.innerHTML = '<div class="op-searching"><div class="op-spin"></div>Buscando na internet…</div>';
        loop.push({ role: 'assistant', content: res.content });
        const tr = res.content.filter(b => b.type === 'tool_use').map(b => ({ type: 'tool_result', tool_use_id: b.id, content: '' }));
        loop.push({ role: 'user', content: tr });
        res = await call(loop);
      }

      const reply = (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim() || 'Não consegui processar.';
      bub.innerHTML = mdRender(reply);
      hist.push({ role: 'assistant', content: reply });
      msgs.scrollTop = msgs.scrollHeight;
    } catch (e) {
      bub.innerHTML = '<em style="color:#fda4af">Erro de conexão.</em>';
    }

    busy = false; sendBtn.disabled = false; ta.focus();
  }
})();
