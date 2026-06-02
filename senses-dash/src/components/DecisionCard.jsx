import React from "react";
import { T, STATUS, OWNERS, moveBtn } from "../theme";

// Card de decisão: arraste para mover/reordenar; clique no corpo edita; ◀▶ move;
// ponto RAG cicla; ✕ exclui (confirma).
export default function DecisionCard({ item, onEdit, onDelete, onMove, onCycleRag, draggable, onDragStart, onDragEnd, dim }) {
  const i = item;
  const stop = (e) => e.stopPropagation();

  const askDelete = (e) => {
    stop(e);
    if (window.confirm(`Excluir o card "${i.title}"?`)) onDelete(i.id);
  };

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => onEdit(i)}
      title="Arraste para mover · clique para editar"
      style={{ background: STATUS[i.rag].bg, border: `1px solid ${STATUS[i.rag].ring}`, borderRadius: 11, padding: 11, cursor: draggable ? "grab" : "pointer", opacity: dim ? 0.4 : 1 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 10, color: T.terra, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 }}>{i.area}</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={(e) => { stop(e); onCycleRag(i.id); }} title="Mudar RAG" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0 }}>
            <span style={{ width: 10, height: 10, borderRadius: 99, background: STATUS[i.rag].dot, display: "inline-block" }} />
          </button>
          <button onClick={askDelete} title="Excluir card" style={{ background: "none", border: "none", color: T.inkSoft, cursor: "pointer", padding: 0, fontSize: 12, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      <div style={{ fontSize: 13.5, fontWeight: 600, margin: "6px 0", lineHeight: 1.3 }}>{i.title}</div>
      {i.note && <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 8, lineHeight: 1.35 }}>{i.note}</div>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10.5, color: i.owner === "senses" ? T.terraDark : T.inkSoft, background: i.owner === "senses" ? T.terraSoft : T.bg, padding: "2px 7px", borderRadius: 6, fontWeight: 600 }}>{OWNERS[i.owner]}</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={(e) => { stop(e); onMove(i.id, -1); }} title="Mover para a esquerda" style={moveBtn}>◀</button>
          <button onClick={(e) => { stop(e); onMove(i.id, 1); }} title="Mover para a direita" style={moveBtn}>▶</button>
        </div>
      </div>
    </div>
  );
}
