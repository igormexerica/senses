import { describe, expect, it } from 'vitest';
import { isCnpj, isCpf, normalizeDocument } from '../src/lib/document.js';

describe('normalizeDocument', () => {
  it('strips máscara de CNPJ', () => {
    expect(normalizeDocument('12.345.678/0001-90')).toBe('12345678000190');
  });

  it('strips máscara de CPF', () => {
    expect(normalizeDocument('123.456.789-00')).toBe('12345678900');
  });

  it('trims espaços em volta de CNPJ já limpo', () => {
    expect(normalizeDocument('  12345678000190  ')).toBe('12345678000190');
  });

  it('aceita CNPJ já normalizado', () => {
    expect(normalizeDocument('12345678000190')).toBe('12345678000190');
  });

  it('retorna null pra string vazia', () => {
    expect(normalizeDocument('')).toBeNull();
  });

  it('retorna null pra só espaços', () => {
    expect(normalizeDocument('   ')).toBeNull();
  });

  it('retorna null pra null', () => {
    expect(normalizeDocument(null)).toBeNull();
  });

  it('retorna null pra undefined', () => {
    expect(normalizeDocument(undefined)).toBeNull();
  });

  it('retorna null pra só caracteres não-numéricos', () => {
    expect(normalizeDocument('abc')).toBeNull();
  });

  it('retorna null pra tamanho 4 (formato inválido)', () => {
    expect(normalizeDocument('1234')).toBeNull();
  });

  it('retorna null pra tamanho 10 (entre CPF e CNPJ)', () => {
    expect(normalizeDocument('1234567890')).toBeNull();
  });

  it('retorna null pra tamanho 15 (acima de CNPJ)', () => {
    expect(normalizeDocument('123456789012345')).toBeNull();
  });
});

describe('isCnpj / isCpf', () => {
  it('isCnpj true em 14 dígitos', () => {
    expect(isCnpj('12345678000190')).toBe(true);
    expect(isCnpj('12345678900')).toBe(false);
  });

  it('isCpf true em 11 dígitos', () => {
    expect(isCpf('12345678900')).toBe(true);
    expect(isCpf('12345678000190')).toBe(false);
  });
});
