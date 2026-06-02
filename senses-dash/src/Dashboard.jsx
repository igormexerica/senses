import React, { useState, useEffect, useCallback } from "react";
import { isConfigured } from "./supabaseClient";
import { useAuth } from "./hooks/useAuth";
import { useDecisions } from "./hooks/useDecisions";
import { useTasks } from "./hooks/useTasks";
import Login from "./auth/Login";
import Board from "./components/Board";
import CardForm from "./components/CardForm";
import Gantt from "./components/Gantt";
import {
  T, STATUS, RAG_ORDER, TASK_STATUS, TASK_STATUS_ORDER, APPROVAL, APPROVAL_ORDER,
  serif, sans, cardStyle,
} from "./theme";

const FONTS = "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Inter+Tight:wght@400;500;600;700&display=swap";

// ---- Gate: configuração → sessão → app -------------------------------------
export default function Dashboard() {
  const { session, loading, signOut } = useAuth();

  if (!isConfigured) return <ConfigNotice />;
  if (loading) return <Splash />;
  if (!session) return <Login />;
  return <DashboardApp session={session} onLogout={signOut} />;
}

function Splash() {
  return (
    <div style={{ ...sans, background: T.bg, color: T.inkSoft, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <link href={FONTS} rel="stylesheet" />
      <div style={{ fontSize: 14 }}>Carregando…</div>
    </div>
  );
}

function ConfigNotice() {
  return (
    <div style={{ ...sans, background: T.bg, color: T.ink, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 22 }}>
      <div style={{ ...cardStyle, maxWidth: 460 }}>
        <h2 style={{ ...serif, fontSize: 20, marginTop: 0 }}>Configuração pendente</h2>
        <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5 }}>
          Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no arquivo
          <code> .env</code> (local) e nas Environment Variables da Vercel. Veja o <strong>README</strong>.
        </p>
      </div>
    </div>
  );
}

// ---- App autenticado -------------------------------------------------------
function DashboardApp({ session, onLogout }) {
  const [tab, setTab] = useState("overview");
  const [filterArea, setFilterArea] = useState("Todas");
  const [openTask, setOpenTask] = useState(null);
  const [form, setForm] = useState(null); // { card } para editar, { stage } para criar
  const [toast, setToast] = useState(null);

  // useCallback estável: sem isso, `notify` muda a cada render, o que invalida o
  // useCallback `load` dos hooks e dispara re-fetch em loop.
  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500);
  }, []);

  const dec = useDecisions(notify);
  const tk = useTasks(notify);
  const items = dec.items;
  const tasks = tk.tasks;

  const areas = ["Todas", ...Array.from(new Set(items.map((d) => d.area)))];
  const visible = filterArea === "Todas" ? items : items.filter((i) => i.area === filterArea);

  const total = items.length;
  const done = items.filter((i) => i.stage === "Concluído").length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const allSubs = tasks.flatMap((t) => t.subtasks || []);
  const deliveryPct = allSubs.length ? Math.round((allSubs.filter((s) => s.status === "done").length / allSubs.length) * 100) : 0;
  const awaitingApproval = allSubs.filter((s) => s.status === "done" && s.approval === "pending").length;

  const totalWeeks = tasks.length ? Math.max(...tasks.map((t) => t.week + t.dur)) : 1;
  const phases = Array.from(new Set(tasks.map((t) => t.phase)));
  const taskProgress = (t) => {
    const subs = t.subtasks || [];
    if (!subs.length) return 0;
    return Math.round((subs.filter((s) => s.status === "done").length / subs.length) * 100);
  };

  const saveCard = (card) => {
    if (form && form.card && form.card.id) dec.update(form.card.id, card);
    else dec.add(card);
  };

  const activeTask = tasks.find((t) => t.id === openTask);
  const loadingData = dec.loading || tk.loading;

  const wrap = { ...sans, background: T.bg, color: T.ink, minHeight: "100vh", padding: "28px 22px 60px" };
  const tabBtn = (key, label) => (
    <button onClick={() => setTab(key)} style={{
      background: tab === key ? T.terra : "transparent",
      color: tab === key ? "#fff" : T.inkSoft, border: "none", borderRadius: 10,
      padding: "9px 18px", fontSize: 13.5, cursor: "pointer", fontWeight: 600,
    }}>{label}</button>
  );

  return (
    <div style={wrap}>
      <link href={FONTS} rel="stylesheet" />
      <div style={{ maxWidth: 1140, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: T.terra, marginBottom: 6, fontWeight: 600 }}>Casa Senses · E-commerce B2C</div>
            <h1 style={{ ...serif, fontSize: 38, margin: 0, fontWeight: 600, lineHeight: 1, color: T.ink }}>Dashboard de Gestão do Projeto</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11.5, color: T.inkSoft }}>{session?.user?.email}</span>
            <button onClick={onLogout} style={{ background: "#fff", color: T.inkSoft, border: `1px solid ${T.line}`, borderRadius: 10, padding: "9px 14px", fontSize: 12, cursor: "pointer" }}>Sair</button>
          </div>
        </div>

        <div style={{ display: "inline-flex", gap: 4, background: "#fff", border: `1px solid ${T.line}`, padding: 5, borderRadius: 13, marginBottom: 24 }}>
          {tabBtn("overview", "Visão geral")}
          {tabBtn("decisions", "Decisões")}
          {tabBtn("timeline", "Cronograma")}
        </div>

        {loadingData && <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 14 }}>Sincronizando com o Supabase…</div>}

        {tab === "overview" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 18 }}>
              <div style={cardStyle}>
                <div style={{ fontSize: 12, color: T.inkSoft }}>Decisões concluídas</div>
                <div style={{ ...serif, fontSize: 36, fontWeight: 600 }}>{pct}%</div>
                <Bar pct={pct} />
                <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 6 }}>{done} de {total}</div>
              </div>
              <div style={cardStyle}>
                <div style={{ fontSize: 12, color: T.inkSoft }}>Entrega (tarefas)</div>
                <div style={{ ...serif, fontSize: 36, fontWeight: 600 }}>{deliveryPct}%</div>
                <Bar pct={deliveryPct} />
                <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 6 }}>{allSubs.filter((s) => s.status === "done").length} de {allSubs.length} tarefas</div>
              </div>
              <div style={{ ...cardStyle, borderColor: awaitingApproval ? "rgba(201,138,43,0.4)" : T.line, background: awaitingApproval ? "rgba(201,138,43,0.07)" : "#fff" }}>
                <div style={{ fontSize: 12, color: T.inkSoft }}>Esperando SUA aprovação</div>
                <div style={{ ...serif, fontSize: 36, fontWeight: 600, color: awaitingApproval ? "#C98A2B" : T.ink }}>{awaitingApproval}</div>
                <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 6 }}>tarefas feitas, pendentes de aprovação</div>
              </div>
              <div style={{ ...cardStyle, borderColor: T.terraRing, background: T.terraSoft }}>
                <div style={{ fontSize: 12, color: T.terraDark, fontWeight: 600 }}>⚠ Risco principal</div>
                <div style={{ ...serif, fontSize: 20, fontWeight: 600, marginTop: 4, color: T.terraDark }}>Logística & Estoque</div>
                <div style={{ fontSize: 11, color: T.terraDark, marginTop: 6, opacity: 0.85 }}>Em observação — depto em reestruturação.</div>
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Foco da semana</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
                {[
                  ["Fiscal / NF-e", "Prioridade nº 1 — reunião com contador", "red"],
                  ["Posse de acessos", "Rápido, sem atrito político", "amber"],
                  ["Sortimento + conteúdo", "Rodar agente de descrição", "green"],
                  ["Logística", "Observar / aguardar reestruturação", "red"],
                ].map(([t, d, r]) => (
                  <div key={t} style={{ background: STATUS[r].bg, border: `1px solid ${STATUS[r].ring}`, borderRadius: 11, padding: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 99, background: STATUS[r].dot }} />
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{t}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: T.inkSoft }}>{d}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "decisions" && (
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18, alignItems: "center" }}>
              {areas.map((a) => (
                <button key={a} onClick={() => setFilterArea(a)} style={{
                  background: filterArea === a ? T.terra : "#fff",
                  color: filterArea === a ? "#fff" : T.inkSoft, border: `1px solid ${filterArea === a ? T.terra : T.line}`,
                  borderRadius: 99, padding: "7px 14px", fontSize: 12.5, cursor: "pointer", fontWeight: 600,
                }}>{a}</button>
              ))}
              <button onClick={() => setForm({ stage: "Reunião" })} style={{ marginLeft: "auto", background: T.terra, color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>+ Novo card</button>
            </div>
            {filterArea !== "Todas" && (
              <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 12 }}>
                Arrastar para reordenar fica disponível na visão <strong>Todas</strong>. Aqui, use ◀▶ para mover entre colunas.
              </div>
            )}
            <Board
              items={visible}
              onAddInColumn={(stage) => setForm({ stage })}
              onEdit={(card) => setForm({ card })}
              onDelete={dec.remove}
              onMove={dec.move}
              onCycleRag={dec.cycleRag}
              onReorder={dec.reorder}
              dndEnabled={filterArea === "Todas"}
            />
          </div>
        )}

        {tab === "timeline" && (
          <div>
            <div style={{ ...cardStyle, marginBottom: 14, background: T.terraSoft, borderColor: T.terraRing }}>
              <div style={{ fontSize: 12.5, color: T.terraDark }}>
                📌 Clique em qualquer barra para abrir as <strong>tarefas da entrega</strong> — criar, editar, mudar status e aprovar.
              </div>
            </div>
            <Gantt tasks={tasks} totalWeeks={totalWeeks} phases={phases} cycleRag={tk.cycleTaskRag} taskProgress={taskProgress} onOpen={setOpenTask} />
          </div>
        )}

        <div style={{ marginTop: 22, fontSize: 11.5, color: T.inkSoft, textAlign: "center" }}>
          Sincronizado via Supabase · mesmos dados em todos os dispositivos (PC, celular, TV da reunião)
        </div>
      </div>

      {form && (
        <CardForm
          initial={form.card || { stage: form.stage }}
          areas={areas}
          onSave={saveCard}
          onClose={() => setForm(null)}
        />
      )}

      {activeTask && (
        <TaskPanel task={activeTask} progress={taskProgress(activeTask)} onClose={() => setOpenTask(null)}
          updateSub={tk.updateSub} addSub={tk.addSub} delSub={tk.delSub} />
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: T.ink, color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, boxShadow: "0 4px 14px rgba(56,49,48,0.25)", zIndex: 80 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function Bar({ pct }) {
  return (
    <div style={{ height: 7, background: "rgba(56,49,48,0.08)", borderRadius: 99, overflow: "hidden", marginTop: 8 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: T.terra }} />
    </div>
  );
}

// Campo de texto com estado local: commita no Supabase só no blur / Enter
// (evita um UPDATE por tecla e o cursor "brigar" com revert otimista).
function SubField({ value, onCommit, style, placeholder }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => { setV(value ?? ""); }, [value]);
  return (
    <input
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== (value ?? "")) onCommit(v); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      style={style}
    />
  );
}

function TaskPanel({ task, progress, onClose, updateSub, addSub, delSub }) {
  const overlay = { position: "fixed", inset: 0, background: "rgba(56,49,48,0.45)", display: "flex", justifyContent: "flex-end", zIndex: 50 };
  const panel = { width: "min(640px, 100%)", height: "100%", background: "#fff", borderLeft: `1px solid ${T.line}`, padding: 24, overflowY: "auto", ...sans, color: T.ink };
  const inp = { background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7, color: T.ink, padding: "5px 8px", fontSize: 12, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 11, color: T.terra, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>{task.phase} · {task.owner === "senses" ? "Senses" : "Agência"}</div>
            <h2 style={{ ...serif, fontSize: 23, margin: "4px 0 0", fontWeight: 600 }}>{task.title}</h2>
          </div>
          <button onClick={onClose} style={{ background: T.bg, color: T.inkSoft, border: `1px solid ${T.line}`, borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer" }}>Fechar</button>
        </div>
        <div style={{ fontSize: 12, color: T.inkSoft, margin: "10px 0 18px" }}>Progresso da entrega: <strong style={{ color: T.ink }}>{progress}%</strong> ({(task.subtasks || []).filter((s) => s.status === "done").length}/{(task.subtasks || []).length} tarefas concluídas)</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(task.subtasks || []).map((s) => (
            <div key={s.id} style={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: 11, padding: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
                <SubField value={s.title} onCommit={(v) => updateSub(task.id, s.id, { title: v })} style={{ ...inp, fontSize: 13.5, fontWeight: 600 }} />
                <button onClick={() => { if (window.confirm("Excluir esta tarefa?")) delSub(task.id, s.id); }} title="Excluir" style={{ background: T.terraSoft, color: T.terra, border: `1px solid ${T.terraRing}`, borderRadius: 7, padding: "5px 9px", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>✕</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <label style={{ fontSize: 10.5, color: T.inkSoft }}>Responsável
                  <SubField value={s.who || ""} onCommit={(v) => updateSub(task.id, s.id, { who: v })} style={{ ...inp, marginTop: 3 }} />
                </label>
                <label style={{ fontSize: 10.5, color: T.inkSoft }}>Data de entrega
                  <input type="date" value={s.due || ""} onChange={(e) => updateSub(task.id, s.id, { due: e.target.value })} style={{ ...inp, marginTop: 3 }} />
                </label>
              </div>
              <label style={{ fontSize: 10.5, color: T.inkSoft, display: "block", marginBottom: 8 }}>Link da entrega (Figma, preview…)
                <SubField value={s.link || ""} placeholder="https://" onCommit={(v) => updateSub(task.id, s.id, { link: v })} style={{ ...inp, marginTop: 3 }} />
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => updateSub(task.id, s.id, { status: TASK_STATUS_ORDER[(TASK_STATUS_ORDER.indexOf(s.status) + 1) % 3] })}
                  style={{ background: TASK_STATUS[s.status].bg, color: TASK_STATUS[s.status].color, border: `1px solid ${T.line}`, borderRadius: 7, padding: "5px 11px", fontSize: 11.5, cursor: "pointer", fontWeight: 600 }}>
                  ● {TASK_STATUS[s.status].label}
                </button>
                <button onClick={() => updateSub(task.id, s.id, { approval: APPROVAL_ORDER[(APPROVAL_ORDER.indexOf(s.approval) + 1) % 3] })}
                  style={{ background: APPROVAL[s.approval].bg, color: APPROVAL[s.approval].color, border: `1px solid ${T.line}`, borderRadius: 7, padding: "5px 11px", fontSize: 11.5, cursor: "pointer", fontWeight: 600 }}>
                  ✓ {APPROVAL[s.approval].label}
                </button>
                {s.link && <a href={s.link} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: T.terra, alignSelf: "center", textDecoration: "none", fontWeight: 600 }}>abrir link ↗</a>}
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => addSub(task.id)} style={{ marginTop: 14, width: "100%", background: T.terra, color: "#fff", border: "none", borderRadius: 9, padding: "10px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>+ Adicionar tarefa</button>
      </div>
    </div>
  );
}
