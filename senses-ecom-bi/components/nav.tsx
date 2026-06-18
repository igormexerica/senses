// Navegação do shell — dados puros. O render fica em components/app-shell.tsx.
// "Comparativo" é a tela ativa. Os demais são placeholders honestos ("em breve"),
// NÃO telas fake — o app já nasce shell pra crescer sem refatorar.
import { BarChart3, ShoppingCart, Sparkles, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
}

export const NAV: NavItem[] = [
  { href: "/comparativo", label: "Comparativo", icon: BarChart3 },
  { href: "/carrinho", label: "Carrinho abandonado", icon: ShoppingCart, soon: true },
  { href: "/creators", label: "Creators", icon: Sparkles, soon: true },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
