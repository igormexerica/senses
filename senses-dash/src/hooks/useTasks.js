import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { RAG_ORDER } from "../theme";

// Carrega tasks + subtasks e aninha subtasks dentro de cada task (formato esperado
// pelo Gantt / TaskPanel). Todas as escritas são optimistic com revert em erro.
export function useTasks(notify) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent) => {
    if (!supabase) return;
    if (!silent) setLoading(true);
    const [tRes, sRes] = await Promise.all([
      supabase.from("tasks").select("*").order("position"),
      supabase.from("subtasks").select("*").order("position"),
    ]);
    if (tRes.error || sRes.error) {
      notify?.("Falha ao carregar cronograma.");
      setLoading(false);
      return;
    }
    const byTask = {};
    (sRes.data || []).forEach((s) => {
      (byTask[s.task_id] ||= []).push(s);
    });
    setTasks((tRes.data || []).map((t) => ({ ...t, subtasks: byTask[t.id] || [] })));
    setLoading(false);
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  // Sincronização ao vivo entre telas.
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase
      .channel("rt-tasks")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => load(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "subtasks" }, () => load(true))
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const cycleTaskRag = async (id) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const prevRag = t.rag;
    const next = RAG_ORDER[(RAG_ORDER.indexOf(t.rag) + 1) % RAG_ORDER.length];
    setTasks((p) => p.map((x) => (x.id === id ? { ...x, rag: next } : x)));
    const { error } = await supabase.from("tasks").update({ rag: next }).eq("id", id);
    if (error) {
      setTasks((p) => p.map((x) => (x.id === id ? { ...x, rag: prevRag } : x)));
      notify?.("Falha ao salvar — desfeito.");
    }
  };

  const updateSub = async (taskId, subId, patch) => {
    const clean = { ...patch };
    if (clean.due === "") clean.due = null; // coluna date não aceita ""
    let original;
    setTasks((p) =>
      p.map((t) =>
        t.id !== taskId
          ? t
          : {
              ...t,
              subtasks: t.subtasks.map((s) => {
                if (s.id !== subId) return s;
                original = s;
                return { ...s, ...patch };
              }),
            }
      )
    );
    const { error } = await supabase.from("subtasks").update(clean).eq("id", subId);
    if (error) {
      setTasks((p) =>
        p.map((t) =>
          t.id !== taskId
            ? t
            : { ...t, subtasks: t.subtasks.map((s) => (s.id === subId ? original : s)) }
        )
      );
      notify?.("Falha ao salvar tarefa — desfeito.");
    }
  };

  const addSub = async (taskId) => {
    const t = tasks.find((x) => x.id === taskId);
    const position = (t?.subtasks?.length) || 0;
    const row = {
      task_id: taskId,
      title: "Nova tarefa",
      who: "",
      due: null,
      status: "todo",
      approval: "pending",
      link: "",
      position,
    };
    const tempId = crypto.randomUUID();
    setTasks((p) =>
      p.map((x) => (x.id !== taskId ? x : { ...x, subtasks: [...(x.subtasks || []), { id: tempId, ...row }] }))
    );
    const { data, error } = await supabase.from("subtasks").insert(row).select().single();
    if (error) {
      setTasks((p) =>
        p.map((x) => (x.id !== taskId ? x : { ...x, subtasks: x.subtasks.filter((s) => s.id !== tempId) }))
      );
      notify?.("Falha ao adicionar tarefa — desfeito.");
      return;
    }
    setTasks((p) =>
      p.map((x) => (x.id !== taskId ? x : { ...x, subtasks: x.subtasks.map((s) => (s.id === tempId ? data : s)) }))
    );
  };

  const delSub = async (taskId, subId) => {
    let removed;
    let idx;
    setTasks((p) =>
      p.map((t) => {
        if (t.id !== taskId) return t;
        idx = t.subtasks.findIndex((s) => s.id === subId);
        removed = t.subtasks[idx];
        return { ...t, subtasks: t.subtasks.filter((s) => s.id !== subId) };
      })
    );
    const { error } = await supabase.from("subtasks").delete().eq("id", subId);
    if (error) {
      setTasks((p) =>
        p.map((t) => {
          if (t.id !== taskId || !removed) return t;
          const copy = [...t.subtasks];
          copy.splice(Math.min(idx, copy.length), 0, removed);
          return { ...t, subtasks: copy };
        })
      );
      notify?.("Falha ao excluir tarefa — desfeito.");
    }
  };

  return { tasks, loading, cycleTaskRag, updateSub, addSub, delSub, reload: load };
}
