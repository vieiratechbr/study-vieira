import { useRef, useCallback } from "react";

/**
 * GlassCard — painel de vidro líquido com efeito especular ao mouse
 * Props:
 *   children, className, style, onClick
 *   tint — cor de tint opcional (ex: "rgba(125,211,252,0.08)")
 */
export default function GlassCard({ children, className = "", style = {}, onClick, tint }) {
  const ref = useRef(null);

  const onMouseMove = useCallback((e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width  * 100).toFixed(1);
    const y = ((e.clientY - rect.top)  / rect.height * 100).toFixed(1);
    el.style.setProperty("--mx", `${x}%`);
    el.style.setProperty("--my", `${y}%`);
    const tiltX = ((e.clientX - rect.left) / rect.width  - 0.5) * 4;
    const tiltY = ((e.clientY - rect.top)  / rect.height - 0.5) * -4;
    el.style.transform = `perspective(900px) rotateX(${tiltY}deg) rotateY(${tiltX}deg) translateZ(2px)`;
  }, []);

  const onMouseLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--mx", "50%");
    el.style.setProperty("--my", "-30%");
    el.style.transform = "perspective(900px) rotateX(0) rotateY(0) translateZ(0)";
  }, []);

  return (
    <div
      ref={ref}
      className={`glass ${className}`}
      style={{
        "--mx": "50%",
        "--my": "-30%",
        willChange: "transform",
        ...(tint ? { background: `linear-gradient(140deg, ${tint} 0%, var(--s) 100%)` } : {}),
        ...style,
      }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
