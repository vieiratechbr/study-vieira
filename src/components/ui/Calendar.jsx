import { useState } from "react";

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const WDAYS  = ["D","S","T","Q","Q","S","S"];
const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * Calendar — calendário reutilizável
 * Props:
 *   events     — array de { date: "YYYY-MM-DD", color: "#hex" }
 *   onSelect   — callback(dateStr) ao clicar num dia
 *   selected   — data selecionada (string YYYY-MM-DD)
 */
export default function Calendar({ events = [], onSelect, selected }) {
  const now   = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevEnd     = new Date(year, month, 0).getDate();
  const today       = todayStr();

  const cells = [];
  for (let i = firstDay - 1; i >= 0; i--)
    cells.push({ d: prevEnd - i, other: true, m: month === 0 ? 11 : month - 1, y: month === 0 ? year - 1 : year });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ d, other: false, m: month, y: year });
  while (cells.length < 35) {
    const d = cells.length - firstDay - daysInMonth + 1;
    cells.push({ d, other: true, m: month === 11 ? 0 : month + 1, y: month === 11 ? year + 1 : year });
  }

  const dateStr = c =>
    `${c.y}-${String(c.m + 1).padStart(2, "0")}-${String(c.d).padStart(2, "0")}`;

  const eventsOnDate = d => events.filter(e => e.date === d);

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button className="btn btn-ghost btn-ico" style={{ fontSize: 13 }} onClick={prev}>‹</button>
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--t2)" }}>{MONTHS[month]} {year}</div>
        <button className="btn btn-ghost btn-ico" style={{ fontSize: 13 }} onClick={next}>›</button>
      </div>

      {/* Day labels */}
      <div className="cal-grid" style={{ marginBottom: 4 }}>
        {WDAYS.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10, color: "var(--t3)", fontWeight: 600, padding: "2px 0" }}>{d}</div>
        ))}
      </div>

      {/* Days */}
      <div className="cal-grid">
        {cells.map((c, i) => {
          const ds   = dateStr(c);
          const evs  = eventsOnDate(ds);
          const isToday    = ds === today;
          const isSelected = ds === selected && !isToday;
          const isOther    = c.other;

          return (
            <div
              key={i}
              className={`cal-cell ${isToday ? "today" : ""} ${isSelected ? "selected" : ""} ${isOther ? "other-month" : ""}`}
              style={{ fontSize: 12 }}
              onClick={() => onSelect?.(ds)}
            >
              {c.d}
              {evs.length > 0 && (
                <div className="cal-dots">
                  {evs.slice(0, 3).map((e, j) => (
                    <div key={j} className="cal-dot" style={{ background: e.color }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
