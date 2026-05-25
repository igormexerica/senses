/**
 * Normalização de CNPJ/CPF — só dígitos, sem máscara.
 *
 * Escopo: normalizar, não validar. Não checamos dígito verificador
 * (a fonte de verdade é o Field Control; se ele aceitou cadastrar,
 * a gente cacheia).
 */

const CPF_LEN = 11;
const CNPJ_LEN = 14;

/**
 * Remove tudo que não é dígito. Retorna null em qualquer formato suspeito:
 *   - input null/undefined/vazio/só não-dígitos
 *   - resultado com tamanho ≠ 11 e ≠ 14 (CPF/CNPJ)
 */
export function normalizeDocument(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const trimmed = String(input).trim();
  if (trimmed === '') return null;
  const digits = trimmed.replace(/\D+/g, '');
  if (digits === '') return null;
  if (digits.length !== CPF_LEN && digits.length !== CNPJ_LEN) return null;
  return digits;
}

export function isCnpj(normalized: string): boolean {
  return normalized.length === CNPJ_LEN && /^\d+$/.test(normalized);
}

export function isCpf(normalized: string): boolean {
  return normalized.length === CPF_LEN && /^\d+$/.test(normalized);
}
