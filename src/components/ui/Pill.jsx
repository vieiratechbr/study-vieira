/**
 * Pill — tag colorida
 * Props:
 *   color  — cor hex ou rgba
 *   label  — texto
 *   icon   — emoji/ícone opcional
 */
export default function Pill({ color, label, icon }) {
  return (
    <span
      className="pill"
      style={{
        background:   `${color}18`,
        borderColor:  `${color}28`,
        color,
      }}
    >
      {icon && <span>{icon}</span>}
      {label}
    </span>
  );
}
