// Estrutura da navegação (dados puros — o render fica em components/sidebar.tsx).
// Agrupado por intenção de uso. Preserva TODAS as telas existentes + Resumo.

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export interface NavGroup {
  label?: string; // sem label = item(ns) solto(s) no topo
  items: NavItem[];
}

export const GROUPS: NavGroup[] = [
  { items: [{ href: "/", label: "Visão geral", icon: "◆" }] },
  {
    label: "Operação",
    items: [
      { href: "/gaps", label: "Gaps do mês", icon: "▲" },
      { href: "/acoes", label: "Ações", icon: "✓" },
      { href: "/revisar", label: "Revisar", icon: "⚑" },
    ],
  },
  {
    label: "Clientes",
    items: [
      { href: "/avaliacoes", label: "Avaliações", icon: "★" },
      { href: "/inventario", label: "Inventário", icon: "▤" },
    ],
  },
  {
    label: "Análise",
    items: [
      { href: "/resumo", label: "Resumo executivo", icon: "📄" },
      { href: "/comparativo", label: "Comparativo", icon: "⇄" },
      { href: "/evolucao", label: "Evolução", icon: "📈" },
      { href: "/atividade", label: "Atividade", icon: "▦" },
    ],
  },
];

// Itens soltos no rodapé do menu (referência/ajuda).
export const FOOTER_ITEMS: NavItem[] = [
  { href: "/processos", label: "Processos", icon: "❔" },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
