import Avatar from "../components/ui/Avatar.jsx";
import { isAdmin, getProfile } from "../db/localStorage.js";
import SFX from "../sounds/sfx.js";

/**
 * NavBar — barra de navegação principal
 */
export default function NavBar({ user, tab, setTab, onLogout, dark, toggleTheme }) {
  const admin = isAdmin(user);
  const prof  = getProfile(user.id);

  const navTabs = [
    { k: "home",       l: "Início"     },
    { k: "materias",   l: "Matérias"   },
    { k: "agenda",     l: "Agenda"     },
    { k: "comunidade", l: "Comunidade" },
  ];

  const go = (key) => { SFX.tab(); setTab(key); };

  return (
    <nav className="nav">
      {/* Logo */}
      <div className="nav-logo" onClick={() => go("home")}>
        ◈ <span style={{ fontWeight: 700 }}>Study</span>
        <span style={{ color: "var(--t2)", fontWeight: 400 }}> Vieira</span>
      </div>

      {/* Main tabs */}
      <div style={{ display: "flex", gap: 2, flex: 1 }}>
        {navTabs.map(t => (
          <button
            key={t.k}
            className={`nav-tab ${tab === t.k ? "active" : ""}`}
            onClick={() => go(t.k)}
          >
            {t.l}
          </button>
        ))}
      </div>

      {/* Right actions */}
      <div className="nav-right">
        {/* Theme toggle */}
        <button
          className="btn btn-ghost btn-ico"
          onClick={toggleTheme}
          title={dark ? "Tema claro" : "Tema escuro"}
          style={{ fontSize: 15, border: "1px solid var(--b2)" }}
        >
          {dark ? "☀️" : "🌙"}
        </button>

        {/* Admin button */}
        {admin && (
          <button
            className="btn btn-admin btn-sm"
            onClick={() => { SFX.click(); setTab("admin"); }}
            title="Painel Admin"
            style={{ padding: "5px 10px", fontSize: 11, letterSpacing: 0.3 }}
          >
            ⭐ Admin
          </button>
        )}

        {/* Avatar → perfil */}
        <div
          style={{
            cursor: "pointer",
            borderRadius: 10,
            padding: "3px 6px",
            transition: "background 0.18s",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
          onClick={() => { SFX.click(); setTab("perfil"); }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--card-bg)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <Avatar src={prof.avatar} name={user.name} size={26} />
        </div>

        <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={onLogout}>
          Sair
        </button>
      </div>
    </nav>
  );
}
