"use server";

import { revalidatePath } from "next/cache";
import { criarInvestimento, removerInvestimento, setMargemPct } from "@/lib/roi";
import type { TipoInvestimento } from "@/lib/types";

/** "YYYY-MM" (input month) ou "YYYY-MM-DD" → dia 1 do mês. */
function mesParaIso(m: string): string | null {
  m = (m || "").trim();
  if (/^\d{4}-\d{2}$/.test(m)) return `${m}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(m)) return `${m.slice(0, 7)}-01`;
  if (/^\d{4}\/\d{2}$/.test(m)) return `${m.replace("/", "-")}-01`; // AAAA/MM
  const br = m.match(/^(\d{1,2})\/(\d{4})$/); // MM/AAAA
  if (br) return `${br[2]}-${br[1].padStart(2, "0")}-01`;
  return null;
}

export async function criarInvestimentoAction(formData: FormData) {
  const tipo = String(formData.get("tipo") || "");
  const fornecedor = String(formData.get("fornecedor") || "").trim();
  const descricao = String(formData.get("descricao") || "").trim() || null;
  const valor = Number(String(formData.get("valor") || "").replace(/\./g, "").replace(",", "."));
  const ini = mesParaIso(String(formData.get("vigencia_ini") || ""));
  const fimRaw = String(formData.get("vigencia_fim") || "");

  if (tipo !== "recorrente" && tipo !== "pontual") throw new Error("Tipo inválido.");
  if (!fornecedor) throw new Error("Fornecedor obrigatório.");
  if (!Number.isFinite(valor) || valor < 0) throw new Error("Valor inválido.");
  if (!ini) throw new Error("Mês inválido.");
  const fim = tipo === "recorrente" && fimRaw ? mesParaIso(fimRaw) : null;

  await criarInvestimento({
    tipo: tipo as TipoInvestimento,
    fornecedor,
    descricao,
    valor,
    vigencia_ini: ini,
    vigencia_fim: fim,
  });
  revalidatePath("/roi");
}

export async function removerInvestimentoAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("ID inválido.");
  await removerInvestimento(id);
  revalidatePath("/roi");
}

export async function setMargemAction(formData: FormData) {
  const raw = String(formData.get("margem") || "").trim().replace(",", ".");
  const v = raw === "" ? null : Number(raw);
  if (v != null && (!Number.isFinite(v) || v < 0 || v > 100)) throw new Error("Margem deve ser 0–100.");
  await setMargemPct(v);
  revalidatePath("/roi");
}
