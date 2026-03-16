/**
 * Avatar — foto de perfil ou iniciais
 * Props:
 *   src      — URL da imagem (opcional)
 *   name     — nome para gerar iniciais
 *   size     — tamanho em px (default 30)
 *   onClick  — handler de clique
 *   editable — mostra overlay de edição ao hover
 */
export default function Avatar({ src, name, size = 30, onClick, editable = false }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  const initials = (name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

  const inner = src
    ? <img src={src} className="av" style={style} alt={name} />
    : <div className="av-placeholder" style={style}>{initials}</div>;

  if (!editable) {
    return (
      <div style={{ cursor: onClick ? "pointer" : "default", flexShrink: 0 }} onClick={onClick}>
        {inner}
      </div>
    );
  }

  return (
    <div className="av-upload" onClick={onClick} style={{ width: size, height: size, flexShrink: 0 }}>
      {inner}
      <div className="av-overlay">✎</div>
    </div>
  );
}
