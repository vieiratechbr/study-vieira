import { useState, useRef, useEffect } from "react";
import GlassCard from "../ui/GlassCard.jsx";
import Pill from "../ui/Pill.jsx";
import { POST_TAG_COLORS } from "../../lib/constants.js";
import { fmtTimestamp } from "../../lib/utils.js";
import { isAdmin } from "../../db/localStorage.js";

/**
 * PostsFeed — feed de avisos estilo Instagram
 *
 * MODO BANNER: admin sobe só uma imagem → ela ocupa o card inteiro, sem texto.
 * MODO BLOG:   admin adiciona título/legenda → aparece sobre a imagem e
 *              o usuário pode clicar para ler o texto completo.
 *
 * Props:
 *   allPosts    — avisos globais
 *   myCommPosts — avisos das comunidades do usuário
 *   user        — usuário logado
 */
export default function PostsFeed({ allPosts = [], myCommPosts = [], user }) {
  const [openPost, setOpenPost] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const feedRef = useRef(null);

  const feed = [
    ...myCommPosts.map(p => ({ ...p, _src: "comm" })),
    ...allPosts.map(p => ({ ...p, _src: "global" })),
  ];

  useEffect(() => {
    const el = feedRef.current; if (!el) return;
    const fn = () => setActiveIdx(Math.round(el.scrollTop / el.clientHeight));
    el.addEventListener("scroll", fn, { passive: true });
    return () => el.removeEventListener("scroll", fn);
  }, []);

  const scrollTo = (i) => feedRef.current?.scrollTo({ top: i * feedRef.current.clientHeight, behavior: "smooth" });

  return (
    <>
      <div>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600 }}>📢 Avisos</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isAdmin(user) && <span style={{ fontSize: 11, color: "#fcd34d", fontWeight: 500 }}>● ADM</span>}
            {feed.length > 0 && <span style={{ fontSize: 11, color: "var(--t3)" }}>{activeIdx + 1}/{feed.length}</span>}
          </div>
        </div>

        {feed.length === 0 ? (
          <GlassCard style={{ padding: 20 }}>
            <div className="empty" style={{ padding: "28px 0" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🖼️</div>
              <p style={{ fontWeight: 500 }}>Nenhum aviso</p>
              <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 5 }}>
                {isAdmin(user) ? "Publique o primeiro aviso no painel Admin" : "Aguarde novidades"}
              </p>
            </div>
          </GlassCard>
        ) : (
          <div className="feed-wrap">
            {/* Nav dots */}
            {feed.length > 1 && (
              <div className="feed-nav">
                {feed.map((_, i) => (
                  <div key={i} className={`feed-dot ${i === activeIdx ? "active" : ""}`} onClick={() => scrollTo(i)} />
                ))}
              </div>
            )}

            {/* Scroll container */}
            <div ref={feedRef} className="feed-inner">
              {feed.map((p, i) => {
                const tc       = POST_TAG_COLORS[p.tag] || "#cbd5e1";
                const isComm   = p._src === "comm";
                const hasText  = !!(p.title || p.body);

                return (
                  <div
                    key={p.id + i}
                    className="feed-slide"
                    style={{ cursor: hasText ? "pointer" : "default" }}
                    onClick={() => hasText && setOpenPost(p)}
                  >
                    {/* Background */}
                    {p.img
                      ? <img src={p.img} className="feed-img" alt="aviso" />
                      : <div className="feed-bg" style={{ background: `linear-gradient(160deg, ${tc}22 0%, var(--bg2, #2c2c2e) 100%)` }} />
                    }

                    {hasText && <div className="feed-gradient" />}
                    <div className="feed-overlay" />
                    {p.pinned && <div className="feed-pin">📌</div>}

                    {/* Community badge */}
                    {isComm && (
                      <div style={{ position: "absolute", top: 14, left: 14, display: "flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.45)", padding: "4px 10px", borderRadius: 20, backdropFilter: "blur(8px)" }}>
                        <span style={{ fontSize: 14 }}>{p.commIcon}</span>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.9)", fontWeight: 500 }}>{p.commName}</span>
                      </div>
                    )}

                    {/* Text overlay — only if title or body exists */}
                    {hasText && (
                      <div className="feed-content">
                        <div className="feed-tag" style={{ background: `${tc}35`, color: tc, border: `1px solid ${tc}55` }}>{p.tag}</div>
                        {p.title && <div className="feed-title">{p.title}</div>}
                        <div className="feed-meta">
                          {p.authorName} · {fmtTimestamp(p.createdAt)}
                          {p.body && <><br /><span style={{ opacity: .7 }}>{p.body.slice(0, 70)}{p.body.length > 70 ? "…" : ""}</span></>}
                        </div>
                        {p.body && p.body.length > 70 && (
                          <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Toque para ler mais →</div>
                        )}
                      </div>
                    )}

                    {/* Pure banner: just tag at bottom */}
                    {!hasText && (
                      <div style={{ position: "absolute", bottom: 14, left: 14, display: "flex", alignItems: "center", gap: 6 }}>
                        <div className="feed-tag" style={{ background: `${tc}40`, color: tc, border: `1px solid ${tc}60`, backdropFilter: "blur(8px)" }}>{p.tag}</div>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{p.authorName}</span>
                      </div>
                    )}

                    {i < feed.length - 1 && <div className="feed-hint">↓ role</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Detail modal — only opens when post has text */}
      {openPost && (
        <div className="modal-overlay" onClick={() => setOpenPost(null)}>
          <GlassCard className="post-detail si" onClick={e => e.stopPropagation()}>
            {openPost.img && <img src={openPost.img} className="post-detail-img" alt="aviso" />}
            <div className="post-detail-body">
              {openPost._src === "comm" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <span style={{ fontSize: 18 }}>{openPost.commIcon}</span>
                  <span style={{ fontSize: 12, color: "var(--t2)", fontWeight: 500 }}>{openPost.commName}</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                <Pill color={POST_TAG_COLORS[openPost.tag] || "#cbd5e1"} label={openPost.tag} />
                {openPost.pinned && <Pill color="#fcd34d" label="📌 Fixado" />}
              </div>
              {openPost.title && <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, lineHeight: 1.3 }}>{openPost.title}</h2>}
              {openPost.body && <div style={{ fontSize: 14, color: "var(--t2)", lineHeight: 1.75, whiteSpace: "pre-wrap", marginBottom: 20 }}>{openPost.body}</div>}
              <div style={{ fontSize: 12, color: "var(--t3)", borderTop: "1px solid var(--b2)", paddingTop: 12 }}>
                Por <strong style={{ color: "var(--t2)" }}>{openPost.authorName}</strong> · {fmtTimestamp(openPost.createdAt)}
              </div>
              <button className="btn btn-ghost" style={{ marginTop: 14, width: "100%" }} onClick={() => setOpenPost(null)}>Fechar</button>
            </div>
          </GlassCard>
        </div>
      )}
    </>
  );
}
