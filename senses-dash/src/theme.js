// Identidade Senses — Terracota proprietário, regra 60/30/10.
// Constantes compartilhadas entre Dashboard e componentes.

export const T = {
  terra: "#D84D3A",       // Terracota protagonista (Pantone 7625C aprox.)
  terraDark: "#B64131",   // Ferrugem
  terraSoft: "rgba(216,77,58,0.08)",
  terraRing: "rgba(216,77,58,0.30)",
  ink: "#383130",         // Pantone 412C — nunca preto puro
  inkSoft: "#5B5450",
  bg: "#F4F2F2",          // Off-white (60%)
  card: "#FFFFFF",
  line: "#E4DFDA",
  blue: "#2A496F",        // secundária
  green: "#5B644E",       // secundária musgo
};

export const STATUS = {
  green: { label: "No prazo", dot: "#5B644E", bg: "rgba(91,100,78,0.10)", ring: "rgba(91,100,78,0.30)" },
  amber: { label: "Atenção", dot: "#C98A2B", bg: "rgba(201,138,43,0.12)", ring: "rgba(201,138,43,0.30)" },
  red: { label: "Risco", dot: "#D84D3A", bg: "rgba(216,77,58,0.10)", ring: "rgba(216,77,58,0.30)" },
};
export const RAG_ORDER = ["green", "amber", "red"];

// Reunião é a PRIMEIRA coluna do board (cards a decidir com CEO/marketing).
export const STAGES = ["Reunião", "A fazer", "Em andamento", "Bloqueado", "Concluído"];
export const OWNERS = { senses: "Senses (você)", terc: "Terceirizada" };

export const TASK_STATUS = {
  todo: { label: "A fazer", color: "#5B5450", bg: "rgba(56,49,48,0.06)" },
  doing: { label: "Fazendo", color: "#C98A2B", bg: "rgba(201,138,43,0.15)" },
  done: { label: "Feito", color: "#5B644E", bg: "rgba(91,100,78,0.15)" },
};
export const TASK_STATUS_ORDER = ["todo", "doing", "done"];

export const APPROVAL = {
  pending: { label: "Pendente aprovação", color: "#5B5450", bg: "rgba(56,49,48,0.06)" },
  approved: { label: "Aprovado", color: "#5B644E", bg: "rgba(91,100,78,0.15)" },
  changes: { label: "Ajustes pedidos", color: "#D84D3A", bg: "rgba(216,77,58,0.12)" },
};
export const APPROVAL_ORDER = ["pending", "approved", "changes"];

export const serif = { fontFamily: "'Playfair Display', Georgia, serif" };
export const sans = { fontFamily: "'Inter Tight', system-ui, sans-serif" };

export const cardStyle = {
  background: T.card,
  border: `1px solid ${T.line}`,
  borderRadius: 16,
  padding: 18,
  boxShadow: "0 1px 3px rgba(56,49,48,0.04)",
};

export const moveBtn = {
  background: "#fff", color: T.inkSoft, border: `1px solid ${T.line}`,
  borderRadius: 6, width: 24, height: 22, fontSize: 10, cursor: "pointer", lineHeight: 1,
};
