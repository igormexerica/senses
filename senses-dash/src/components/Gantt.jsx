import React from "react";
import { T, STATUS, cardStyle } from "../theme";

// Cronograma (Gantt). Clique numa barra/linha abre o painel de tarefas da entrega.
export default function Gantt({ tasks, totalWeeks, phases, cycleRag, taskProgress, onOpen }) {
  const colW = 100 / totalWeeks;
  return (
    <div style={{ ...cardStyle, overflowX: "auto" }}>
      <div style={{ display: "flex", marginLeft: 290, marginBottom: 8 }}>
        {Array.from({ length: totalWeeks }).map((_, w) => (
          <div key={w} style={{ flex: 1, fontSize: 10, color: T.inkSoft, textAlign: "center", minWidth: 26 }}>S{w + 1}</div>
        ))}
      </div>
      {phases.map((phase) => (
        <div key={phase} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: T.terra, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700, margin: "10px 0 4px" }}>{phase}</div>
          {tasks.filter((t) => t.phase === phase).map((t) => {
            const prog = taskProgress(t);
            const nSub = (t.subtasks || []).length;
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
                <div onClick={() => onOpen(t.id)} style={{ width: 290, paddingRight: 12, flexShrink: 0, cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <button onClick={(e) => { e.stopPropagation(); cycleRag(t.id); }} title="Mudar RAG" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 99, background: STATUS[t.rag].dot, display: "inline-block" }} />
                    </button>
                    <span style={{ fontSize: 12.5, lineHeight: 1.25 }}>{t.title}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, marginLeft: 16 }}>
                    <span style={{ fontSize: 9.5, color: t.owner === "senses" ? T.terraDark : T.inkSoft, background: t.owner === "senses" ? T.terraSoft : T.bg, padding: "1px 6px", borderRadius: 5, fontWeight: 600 }}>{t.owner === "senses" ? "Senses" : "Agência"}</span>
                    <span style={{ fontSize: 9.5, color: T.inkSoft }}>{nSub ? `${nSub} tarefa(s) · ${prog}%` : "sem tarefas · clique p/ abrir"}</span>
                  </div>
                </div>
                <div onClick={() => onOpen(t.id)} style={{ flex: 1, position: "relative", height: 24, background: T.bg, borderRadius: 6, minWidth: 26 * totalWeeks, cursor: "pointer" }}>
                  <div style={{
                    position: "absolute", left: `${t.week * colW}%`, width: `${t.dur * colW}%`, top: 3, bottom: 3,
                    background: STATUS[t.rag].bg, border: `1px solid ${STATUS[t.rag].ring}`, borderRadius: 5, overflow: "hidden",
                  }}>
                    <div style={{ width: `${prog}%`, height: "100%", background: STATUS[t.rag].dot, opacity: 0.5 }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
