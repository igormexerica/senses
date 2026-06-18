/**
 * Tipos do Comparativo — PUROS (sem "server-only"), pra importar tanto no server
 * (lib/db.ts) quanto no client (componentes). Nenhuma credencial mora aqui.
 */

export interface Kpis {
  dias: number | null;
  visitas: number | null; // GA4 — null = sem dados
  carrinhos: number | null; // GA4
  checkouts: number | null; // GA4
  vendas: number | null; // Nuvemshop — qtd de pedidos pagos
  receita: number | null; // Nuvemshop — R$
  ticket_medio: number | null; // receita / vendas
  taxa_conversao: number | null; // vendas / visitas (%)
  taxa_carrinho: number | null; // carrinhos / visitas (%)
  taxa_inicio_checkout: number | null; // checkouts / visitas (%)
  taxa_conclusao: number | null; // vendas / checkouts (%)
  media_visitas_dia: number | null;
  media_receita_dia: number | null;
}

export interface TrafegoRow {
  valor: string; // 'Busca','Direto' | 'mobile','desktop',...
  visitas: number | null;
  pct: number | null;
}

export interface RetencaoRow {
  etapa: string; // begin_checkout | add_shipping_info | add_payment_info | purchase
  eventos: number | null;
  pct_do_inicio: number | null;
}

export interface PeriodoData {
  ini: string;
  fim: string;
  dias: number | null;
  kpis: Kpis;
  trafego: { origem: TrafegoRow[]; dispositivo: TrafegoRow[] };
  retencao: RetencaoRow[];
}

export interface Delta {
  pct?: number | null; // variação relativa (%) — métricas absolutas
  pp?: number | null; // diferença em pontos percentuais — métricas que já são taxa
}
export type DeltasPar = Record<keyof Kpis, Delta>;

export interface Comparativo {
  periodos: PeriodoData[]; // length 3, P1 (antigo) → P3 (agora)
  deltas: { p2_p1: DeltasPar; p3_p2: DeltasPar; p3_p1: DeltasPar };
  ultima_atualizacao: string | null;
}

// --- ROI / Investimentos ---
export type TipoInvestimento = "recorrente" | "pontual";

export interface Investimento {
  id: string;
  tipo: TipoInvestimento;
  categoria: string;
  descricao: string | null;
  valor: number;
  vigencia_ini: string; // YYYY-MM-DD (dia 1 do mês)
  vigencia_fim: string | null; // recorrente: fim/null=em aberto; pontual: = ini
  criado_em: string;
}

export interface RoiMes {
  mes: string; // YYYY-MM-01
  receita: number;
  investimento: number;
  receita_acum: number;
  investimento_acum: number;
  roi_receita_pct: number | null; // ROI mensal s/ receita
  roi_receita_acum_pct: number | null; // ROI acumulado s/ receita (a "evolução")
  lucro_acum: number | null; // receita_acum × margem% (se margem definida)
  roi_lucro_acum_pct: number | null; // ROI acumulado s/ lucro
}

export interface RoiPayload {
  margem_pct: number | null;
  meses: RoiMes[];
  resumo: {
    investimento_acum: number;
    receita_acum: number;
    lucro_acum: number | null;
    roi_receita_acum_pct: number | null;
    roi_lucro_acum_pct: number | null;
    payback_mes: string | null; // 1º mês com receita_acum >= investimento_acum
  };
}
