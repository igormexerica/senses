import React, { useState } from "react";
import { T, STAGES, cardStyle } from "../theme";
import DecisionCard from "./DecisionCard";

// Board de colunas (Reunião · A fazer · Em andamento · Bloqueado · Concluído).
// Drag-and-drop nativo move/reordena cards; ◀▶ continua como fallback (touch).
export default function Board({ items, onAddInColumn, onEdit, onDelete, onMove, onCycleRag, onReorder, dndEnabled = true }) {
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null); // { stage, beforeId } — beforeId null = fim

  const endDrag = () => { setDragId(null); setOver(null); };
  const drop = (stage) => {
    if (dragId) onReorder(dragId, stage, over && over.stage === stage ? over.beforeId : null);
    endDrag();
  };

  const DropLine = () => <div style={{ height: 2, background: T.terra, borderRadius: 2 }} />;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 14 }}>
      {STAGES.map((stage) => {
        const col = items.filter((i) => i.stage === stage);
        const isReuniao = stage === "Reunião";
        const overThis = over && over.stage === stage;
        const showEnd = overThis && over.beforeId === null;
        return (
          <div
            key={stage}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              // só chega aqui quando NÃO está sobre um card (cards param a propagação)
              setOver((o) => (o && o.stage === stage && o.beforeId === null ? o : { stage, beforeId: null }));
            }}
            onDrop={(e) => { e.preventDefault(); drop(stage); }}
            style={{
              ...cardStyle, padding: 14,
              borderColor: dragId && overThis ? T.terra : isReuniao ? T.terraRing : T.line,
              background: isReuniao ? T.terraSoft : T.card,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: isReuniao ? T.terraDark : T.ink }}>
                {isReuniao ? "📌 Reunião" : stage}
              </span>
              <span style={{ fontSize: 11, color: T.inkSoft, background: "#fff", border: `1px solid ${T.line}`, padding: "2px 8px", borderRadius: 99 }}>{col.length}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 12 }}>
              {col.length === 0 && !dragId && (
                <div style={{ fontSize: 12, color: "#B0A89F", fontStyle: "italic", padding: "8px 0" }}>
                  {isReuniao ? "Pautas a decidir aparecem aqui" : "—"}
                </div>
              )}
              {col.map((i) => {
                const showBefore = overThis && over.beforeId === i.id;
                return (
                  <div
                    key={i.id}
                    onDragOver={(e) => {
                      if (!dragId || i.id === dragId) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      const after = e.clientY > r.top + r.height / 2;
                      const colNoDrag = col.filter((c) => c.id !== dragId);
                      const pos = colNoDrag.findIndex((c) => c.id === i.id);
                      const beforeId = after ? (colNoDrag[pos + 1] ? colNoDrag[pos + 1].id : null) : i.id;
                      setOver((o) => (o && o.stage === stage && o.beforeId === beforeId ? o : { stage, beforeId }));
                    }}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(stage); }}
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    {showBefore && <DropLine />}
                    <DecisionCard
                      item={i} onEdit={onEdit} onDelete={onDelete} onMove={onMove} onCycleRag={onCycleRag}
                      draggable={dndEnabled} onDragStart={() => setDragId(i.id)} onDragEnd={endDrag} dim={dragId === i.id}
                    />
                  </div>
                );
              })}
              {showEnd && col.some((c) => c.id !== dragId) && <DropLine />}
            </div>

            <button
              onClick={() => onAddInColumn(stage)}
              style={{ marginTop: 12, width: "100%", background: "#fff", color: T.inkSoft, border: `1px dashed ${T.line}`, borderRadius: 9, padding: "8px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
            >
              + Novo card
            </button>
          </div>
        );
      })}
    </div>
  );
}
