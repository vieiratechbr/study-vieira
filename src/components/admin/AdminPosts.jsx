import { useState, useRef } from "react";
import GlassCard from "../ui/GlassCard.jsx";
import Pill from "../ui/Pill.jsx";
import { POST_TAGS, POST_TAG_COLORS } from "../../lib/constants.js";
import { uid, fmtTimestamp } from "../../lib/utils.js";
import { DB, K } from "../../db/localStorage.js";
import SFX from "../../sounds/sfx.js";

/**
 * AdminPosts — gerenciamento de avisos globais com foto de capa
 */
export default function AdminPosts({ user }) {
  const [posts, setPosts]     = useState(() => DB.get(K.posts) || []);
  const [modal, setModal]     = useState(null);
  const [title, setTitle]     = useState("");
  const [body, setBody]       = useState("");
  const [tag, setTag]         = useState("Aviso");
  const [pinned, setPinned]   = useState(false);
  const [coverImg, setCoverImg] = useState(null);
  const [err, setErr]         = useState("");
  const fileRef = useRef(null);

  const save = (v) => { DB.set(K.posts, v); setPosts(v); };

  const openNew = () => {
    setTitle(""); setBody(""); setTag("Aviso");
    setPinned(false); setCoverImg(null); setErr("");
    SFX.open(); setModal("new");
  };

  const openEdit = (p) => {
    setTitle(p.title); setBody(p.body);
    setTag(p.tag || "Aviso"); setPinned(p.pinned || false);
    setCoverImg(p.coverImg || null); setErr("");
    setModal(p);
  };

  const handleImg = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCoverImg(ev.target.result);
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (!title.trim() || !body.trim()) { setErr("Preencha título e conteúdo."); return; }
    if (modal === "new") {
      save([...posts, {
        id: uid(), title: title.trim(), body, tag, pinned, coverImg,
        authorName: user.name, authorEmail: user.email, createdAt: Date.now()
      }]);
    } else {
      save(posts.map(p => p.id === modal.id
        ? { ...p, title: title.trim(), body, tag, pinned, coverImg }
        : p
      ));
    }
    SFX.save(); SFX.close(); setModal(null);
  };

  const del = (id) => {
    save(posts.filter(p => p.id !== id));
    SFX.close(); setModal(null);
  };

  const sorted = [...posts].sort((a, b) =>
    (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt
  );

  return (
    <div>
      <div className="sh">
        <h2 style={{ fontSize: 15, color: "var(--t2)" }}>Avisos globais — vistos por todos</h2>
        <button className="btn btn-admin btn-sm" onClick={openNew}>+ Novo Aviso</button>
      </div>

      {sorted.length === 0 ? (
        <GlassCard>
          <div className="empty">
            <div style={{ fontSize: 32, marginBottom: 8 }}>📢</div>
            <p>Nenhum aviso publicado</p>
          </div>
        </GlassCard>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
          {sorted.map(p => {
            const tc = POST_TAG_COLORS[p.tag] || "#cbd5e1";
            return (
              <div
                key={p.id}
                onClick={() => openEdit(p)}
                style={{
                  position: "relative", borderRadius: 14, overflow: "hidden",
                  aspectRatio: "9/10", cursor: "pointer",
                  background: p.coverImg ? "none" : "var(--s)",
                  border: "1px solid var(--b)",
                }}
              >
                {p.coverImg ? (
                  <img src={p.coverImg} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} alt="" />
                ) : (
                  <div style={{ width: "100%", height: "100%", background: `linear-gradient(135deg, ${tc}22, var(--s))` }} />
                )}
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 55%)" }} />
                {p.pinned && <div style={{ position: "absolute", top: 10, right: 10, fontSize: 16 }}>📌</div>}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 12px 10px" }}>
                  <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600, background: `${tc}30`, color: tc, border: `1px solid ${tc}50`, marginBottom: 5 }}>
                    {p.tag}
                  </span>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>{p.title}</div>
                </div>
                <button
                  className="btn btn-danger"
                  style={{ position: "absolute", top: 8, left: 8, padding: "3px 7px", fontSize: 10, borderRadius: 7 }}
                  onClick={e => { e.stopPropagation(); del(p.id); }}
                >✕</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <GlassCard className="modal-box si" style={{ maxWidth: 540, padding: 0, overflow: "hidden" }} onClick={e => e.stopPropagation()}>
            {/* Image upload area */}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImg} />
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                width: "100%", height: 160, cursor: "pointer", position: "relative",
                background: coverImg ? "none" : "rgba(255,255,255,0.04)",
                display: "flex", alignItems: "center", justifyContent: "center",
                borderBottom: "1px solid var(--b2)",
              }}
            >
              {coverImg ? (
                <>
                  <img src={coverImg} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="cover" />
                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: 500 }}>✎ Trocar imagem</span>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: "center", color: "var(--t3)" }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>🖼️</div>
                  <div style={{ fontSize: 13 }}>Clique para adicionar foto de capa</div>
                  <div style={{ fontSize: 11, marginTop: 3, color: "var(--t3)" }}>Opcional — preencherá o card inteiro no feed</div>
                </div>
              )}
            </div>

            <div style={{ padding: 22 }}>
              <h3 style={{ marginBottom: 16, fontSize: 16 }}>{modal === "new" ? "Novo Aviso Global" : "Editar Aviso"}</h3>
              {err && <div className="alert alert-error">{err}</div>}

              <div className="fg">
                <label>Título</label>
                <input className="inp" placeholder="Título do aviso" value={title} onChange={e => setTitle(e.target.value)} />
              </div>

              <div className="fr">
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Categoria</label>
                  <select className="inp" value={tag} onChange={e => setTag(e.target.value)}>
                    {POST_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Opções</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, height: 40 }}>
                    <input type="checkbox" id="pin-post" checked={pinned} onChange={e => setPinned(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
                    <label htmlFor="pin-post" style={{ fontSize: 13, cursor: "pointer" }}>📌 Fixar no topo</label>
                  </div>
                </div>
              </div>

              <div className="fg" style={{ marginTop: 10, marginBottom: 18 }}>
                <label>Conteúdo</label>
                <textarea className="inp" rows={4} placeholder="Escreva o aviso completo..." value={body} onChange={e => setBody(e.target.value)} />
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-fill" style={{ flex: 1 }} onClick={submit}>
                  {modal === "new" ? "Publicar" : "Salvar"}
                </button>
                {modal !== "new" && (
                  <>
                    <button className="btn btn-danger" onClick={() => del(modal.id)}>Excluir</button>
                    {coverImg && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setCoverImg(null)} style={{ fontSize: 11 }}>
                        🗑 Foto
                      </button>
                    )}
                  </>
                )}
                <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
              </div>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
