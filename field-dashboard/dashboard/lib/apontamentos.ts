/**
 * Playbook curado por tag de OS — "o que significa" + "ação padrão".
 * DEFAULTS razoáveis pra Camila/Igor refinarem (a fonte da verdade é o time de CS).
 * Tag sem entrada cai no fallback. As chaves são os slugs normalizados das etiquetas
 * escopo='os' (ver sync_clientes.normalizar_etiqueta / lista em DESCOBERTAS-API.md).
 */
export interface Playbook {
  significado: string;
  acao: string;
}

const PLAYBOOK: Record<string, Playbook> = {
  alerta: {
    significado: "OS sinalizada como alerta pelo técnico — pede atenção do CS.",
    acao: "Ler o comentário do técnico, contatar o cliente e registrar um plano de ação.",
  },
  "consumo-elevado": {
    significado: "Consumo de fragrância acima do esperado.",
    acao: "Revisar programação/intensidade (PR) e alinhar a expectativa com o cliente.",
  },
  "baixo-consumo": {
    significado: "Consumo abaixo do esperado.",
    acao: "Conferir se o equipamento está ligado/programado e validar a percepção do cliente.",
  },
  "equi.-desligado": {
    significado: "Equipamento encontrado desligado.",
    acao: "Acionar o cliente para religar e orientar sobre o funcionamento.",
  },
  "equip.-fora-do-local": {
    significado: "Equipamento fora do local previsto.",
    acao: "Confirmar a realocação com o cliente e atualizar o cadastro.",
  },
  "realocar-equipamento": {
    significado: "Equipamento a ser realocado.",
    acao: "Coordenar a realocação com o cliente e atualizar o inventário.",
  },
  "troca-de-equipamento": {
    significado: "Troca de equipamento realizada ou solicitada.",
    acao: "Confirmar a troca e atualizar o inventário do cliente.",
  },
  "ajuste-de-pr.": {
    significado: "Ajuste de programação / PR do equipamento.",
    acao: "Validar a nova programação com o cliente e registrar.",
  },
  "alterado-programacao": {
    significado: "Programação do equipamento foi alterada.",
    acao: "Confirmar os parâmetros novos e registrar a mudança.",
  },
  "retorno-15-dias": {
    significado: "Necessário retorno em até 15 dias.",
    acao: "Agendar o retorno dentro do prazo.",
  },
  "antecipar-visita": {
    significado: "A visita precisa ser antecipada.",
    acao: "Reagendar a visita para uma data mais próxima.",
  },
  "relacion.-acionar": {
    significado: "Relacionamento deve acionar o cliente.",
    acao: "Fazer contato proativo do CS com o cliente.",
  },
  "cliente-insatisfeito": {
    significado: "Cliente sinalizou insatisfação.",
    acao: "Tratar como risco de churn — contato imediato e plano de retenção.",
  },
  "reclamacao-reccor": {
    significado: "Reclamação registrada (RecCor).",
    acao: "Investigar a reclamação e dar retorno ao cliente.",
  },
  "repos.-tecnologia": {
    significado: "Reposição de tecnologia/equipamento.",
    acao: "Programar a reposição com a operação.",
  },
  "envio-ref-incompleto": {
    significado: "Envio de refil saiu incompleto.",
    acao: "Completar o envio pendente o quanto antes.",
  },
  imediata: {
    significado: "Demanda marcada como imediata.",
    acao: "Priorizar agora.",
  },
  critico: {
    significado: "Situação crítica sinalizada.",
    acao: "Priorizar e acionar o cliente imediatamente.",
  },
};

const FALLBACK: Playbook = {
  significado: "Apontamento operacional sinalizado na OS.",
  acao: "Revisar o comentário do técnico e acionar o cliente quando necessário.",
};

export function playbook(tag: string): Playbook {
  return PLAYBOOK[tag] ?? FALLBACK;
}
