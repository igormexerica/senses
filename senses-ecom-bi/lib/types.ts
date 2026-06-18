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
