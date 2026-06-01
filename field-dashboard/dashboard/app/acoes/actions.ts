"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { upsertAcao, removerAcao } from "@/lib/field-write";
import { checkBasic, isUuid } from "@/lib/auth";
import type { StatusAcao } from "@/lib/field";

const VALIDOS: StatusAcao[] = ["agendado", "em_contato", "aguardando_cliente", "resolvido"];

/** Form action: registra/atualiza ou remove a ação de um gap. */
export async function registrarAcao(formData: FormData): Promise<void> {
  // defense-in-depth: não depende só do matcher do proxy
  const h = await headers();
  if (!checkBasic(h.get("authorization"))) {
    throw new Error("Não autorizado.");
  }

  const expectativa_id = String(formData.get("expectativa_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const responsavel = String(formData.get("responsavel") ?? "").trim() || null;
  const nota = String(formData.get("nota") ?? "").trim() || null;

  if (!isUuid(expectativa_id)) return; // id inválido: ignora

  if (String(formData.get("_action") ?? "") === "remover") {
    await removerAcao(expectativa_id);
  } else if ((VALIDOS as string[]).includes(status)) {
    await upsertAcao({ expectativa_id, status: status as StatusAcao, responsavel, nota });
  } else {
    return; // status inválido: ignora
  }

  revalidatePath("/gaps");
  revalidatePath("/acoes");
  revalidatePath("/");
}
