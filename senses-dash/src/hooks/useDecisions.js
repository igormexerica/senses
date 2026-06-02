import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { STAGES, RAG_ORDER } from "../theme";

const TABLE = "decisions";

// Posição no fim da coluna (máximo+1) — robusto às posições globais do seed.
const nextPosition = (items, stage, excludeId) => {
  const ps = items.filter((i) => i.stage === stage && i.id !== excludeId).map((i) => i.position ?? 0);
  return ps.length ? Math.max(...ps) + 1 : 0;
};

// CRUD de decisions no Supabase com optimistic update + revert em caso de erro.
export function useDecisions(notify) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent) => {
    if (!supabase) return;
    if (!silent) setLoading(true);
    const { data, error } = await supabase.from(TABLE).select("*").order("position");
    if (error) {
      notify?.("Falha ao carregar decisões.");
    } else {
      setItems(data || []);
    }
    setLoading(false);
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  // Sincronização ao vivo entre telas (PC, celular, TV da reunião).
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase
      .channel("rt-decisions")
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, () => load(true))
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const add = async (card) => {
    const tempId = crypto.randomUUID();
    const position = nextPosition(items, card.stage); // fim da coluna
    const optimistic = { id: tempId, note: "", position, ...card };
    setItems((p) => [...p, optimistic]);
    const { data, error } = await supabase
      .from(TABLE)
      .insert({ ...card, position })
      .select()
      .single();
    if (error) {
      setItems((p) => p.filter((i) => i.id !== tempId));
      notify?.("Falha ao criar card — desfeito.");
      return;
    }
    setItems((p) => p.map((i) => (i.id === tempId ? data : i)));
  };

  const update = async (id, patch) => {
    // revert escopado ao registro: não derruba edições concorrentes em voo
    let original;
    setItems((p) =>
      p.map((i) => {
        if (i.id !== id) return i;
        original = i;
        return { ...i, ...patch };
      })
    );
    const { error } = await supabase.from(TABLE).update(patch).eq("id", id);
    if (error) {
      setItems((p) => p.map((i) => (i.id === id ? original : i)));
      notify?.("Falha ao salvar — desfeito.");
    }
  };

  const remove = async (id) => {
    let removed;
    let idx;
    setItems((p) => {
      idx = p.findIndex((i) => i.id === id);
      removed = p[idx];
      return p.filter((i) => i.id !== id);
    });
    const { error } = await supabase.from(TABLE).delete().eq("id", id);
    if (error) {
      setItems((p) => {
        if (!removed) return p;
        const copy = [...p];
        copy.splice(Math.min(idx, copy.length), 0, removed);
        return copy;
      });
      notify?.("Falha ao excluir — desfeito.");
    }
  };

  const move = (id, dir = 1) => {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    const idx = STAGES.indexOf(it.stage);
    const next = STAGES[Math.min(STAGES.length - 1, Math.max(0, idx + dir))];
    if (next !== it.stage) {
      update(id, { stage: next, position: nextPosition(items, next, id) }); // fim da coluna destino
    }
  };

  // Drag-and-drop: move `cardId` para `targetStage`, inserindo antes de `beforeId`
  // (null = fim da coluna). Reindexa as colunas afetadas e persiste só o que mudou.
  const reorder = async (cardId, targetStage, beforeId) => {
    if (cardId === beforeId) return;
    const dragged = items.find((i) => i.id === cardId);
    if (!dragged) return;

    const sorted = [...items].sort((a, b) => a.position - b.position);
    const target = sorted.filter((i) => i.stage === targetStage && i.id !== cardId);
    let idx = beforeId ? target.findIndex((i) => i.id === beforeId) : target.length;
    if (idx === -1) idx = target.length;
    const newTarget = [...target.slice(0, idx), dragged, ...target.slice(idx)];

    const updates = new Map(); // id -> patch
    newTarget.forEach((it, pos) => {
      if (it.id === cardId) {
        if (it.stage !== targetStage || it.position !== pos) updates.set(it.id, { stage: targetStage, position: pos });
      } else if (it.position !== pos) {
        updates.set(it.id, { position: pos });
      }
    });
    if (dragged.stage !== targetStage) {
      const src = sorted.filter((i) => i.stage === dragged.stage && i.id !== cardId);
      src.forEach((it, pos) => {
        if (it.position !== pos) updates.set(it.id, { position: pos });
      });
    }
    if (updates.size === 0) return;

    const prev = items; // reorder é um gesto atômico → revert do conjunto é aceitável
    setItems((p) => p.map((i) => (updates.has(i.id) ? { ...i, ...updates.get(i.id) } : i)));
    const results = await Promise.all(
      [...updates.entries()].map(([id, patch]) => supabase.from(TABLE).update(patch).eq("id", id))
    );
    if (results.some((r) => r.error)) {
      setItems(prev);
      notify?.("Falha ao reordenar — desfeito.");
    }
  };

  const cycleRag = (id) => {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    const next = RAG_ORDER[(RAG_ORDER.indexOf(it.rag) + 1) % RAG_ORDER.length];
    update(id, { rag: next });
  };

  return { items, loading, add, update, remove, move, cycleRag, reorder, reload: load };
}
