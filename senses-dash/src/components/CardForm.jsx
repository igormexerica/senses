import React, { useState } from "react";
import { T, STATUS, STAGES, OWNERS, RAG_ORDER, serif, sans } from "../theme";

const EMPTY = { title: "", area: "Geral", owner: "senses", stage: "Reunião", rag: "green", note: "" };

// Form de criar/editar card. `initial` preenchido => modo edição.
export default function CardForm({ initial, areas, onSave, onClose }) {
  const editing = Boolean(initial && initial.id);
  const [form, setForm] = useState({ ...EMPTY, ...(initial || {}) });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave({
      title: form.title.trim(),
      area: (form.area || "Geral").trim() || "Geral",
      owner: form.owner,
      stage: form.stage,
      rag: form.rag,
      note: form.note || "",
    });
    onClose();
  };

  const overlay = { position: "fixed", inset: 0, background: "rgba(56,49,48,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 18 };
  const panel = { ...sans, width: "min(460px, 100%)", background: "#fff", border: `1px solid ${T.line}`, borderRadius: 16, padding: 22, color: T.ink, maxHeight: "90vh", overflowY: "auto" };
  const inp = { background: T.bg, border: `1px solid ${T.line}`, borderRadius: 8, color: T.ink, padding: "9px 10px", fontSize: 13, fontFamily: "inherit", width: "100%", boxSizing: "border-box", marginTop: 4 };
  const lbl = { fontSize: 11.5, color: T.inkSoft, fontWeight: 600 };

  const existingAreas = (areas || []).filter((a) => a && a !== "Todas");

  return (
    <div style={overlay} onClick={onClose}>
      <form style={panel} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 style={{ ...serif, fontSize: 21, margin: "0 0 16px", fontWeight: 600 }}>{editing ? "Editar card" : "Novo card"}</h2>

        <label style={{ ...lbl, display: "block", marginBottom: 12 }}>Título
          <input value={form.title} onChange={(e) => set("title", e.target.value)} required autoFocus style={inp} placeholder="Ex.: Definir política de frete grátis" />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <label style={lbl}>Área
            <input list="areas-list" value={form.area} onChange={(e) => set("area", e.target.value)} style={inp} placeholder="Escolha ou digite nova" />
            <datalist id="areas-list">
              {existingAreas.map((a) => <option key={a} value={a} />)}
            </datalist>
          </label>
          <label style={lbl}>Dono
            <select value={form.owner} onChange={(e) => set("owner", e.target.value)} style={inp}>
              {Object.entries(OWNERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <label style={lbl}>Coluna
            <select value={form.stage} onChange={(e) => set("stage", e.target.value)} style={inp}>
              {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label style={lbl}>RAG
            <select value={form.rag} onChange={(e) => set("rag", e.target.value)} style={inp}>
              {RAG_ORDER.map((r) => <option key={r} value={r}>{STATUS[r].label}</option>)}
            </select>
          </label>
        </div>

        <label style={{ ...lbl, display: "block", marginBottom: 18 }}>Nota
          <textarea value={form.note} onChange={(e) => set("note", e.target.value)} rows={3} style={{ ...inp, resize: "vertical" }} placeholder="Contexto, pendência, decisão…" />
        </label>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ background: T.bg, color: T.inkSoft, border: `1px solid ${T.line}`, borderRadius: 9, padding: "9px 16px", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button type="submit" style={{ background: T.terra, color: "#fff", border: "none", borderRadius: 9, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{editing ? "Salvar" : "Criar card"}</button>
        </div>
      </form>
    </div>
  );
}
