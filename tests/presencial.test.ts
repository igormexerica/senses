import { describe, expect, it } from 'vitest';
import { calcularDatasPresencial } from '../src/calculators/presencial.js';

const utc = (yyyymmdd: string): Date => new Date(`${yyyymmdd}T00:00:00Z`);

describe('calcularDatasPresencial', () => {
  it('contrato de 12 meses começando dia 15 → 13 visitas (inicial + 12 mensais)', () => {
    const os = calcularDatasPresencial({
      contratoInicio: utc('2026-01-15'),
      contratoFim: utc('2027-01-15'),
    });
    expect(os).toHaveLength(13);
    expect(os.filter((o) => o.tipo === 'visita_tecnica_inicial')).toHaveLength(1);
    expect(os.filter((o) => o.tipo === 'visita_tecnica_regular')).toHaveLength(12);
    // Todas no dia 15
    expect(os.every((o) => o.data.endsWith('-15'))).toBe(true);
    expect(os.at(-1)!.data).toBe('2027-01-15');
  });

  it('início dia 31: desliza nos meses curtos e VOLTA pro 31 nos meses longos', () => {
    const os = calcularDatasPresencial({
      contratoInicio: utc('2026-01-31'),
      contratoFim: utc('2026-08-31'),
    });
    // jan 31, fev 28, mar 31, abr 30, mai 31, jun 30, jul 31, ago 31
    expect(os.map((o) => o.data)).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
      '2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31',
    ]);
    // Descrição da regular de fevereiro indica deslize de 31 → 28
    const fev = os.find((o) => o.data === '2026-02-28');
    expect(fev?.descricao).toContain('ajustado de 31 para 28');
    // Descrição da regular de março NÃO indica deslize (voltou pro 31)
    const mar = os.find((o) => o.data === '2026-03-31');
    expect(mar?.descricao).toBe('Visita técnica mensal');
  });

  it('ano bissexto: dia 31 cai em fev 29 (não fev 28)', () => {
    const os = calcularDatasPresencial({
      contratoInicio: utc('2024-01-31'),
      contratoFim: utc('2024-03-31'),
    });
    const fev = os.find((o) => o.tipo === 'visita_tecnica_regular' && o.data.startsWith('2024-02'));
    expect(fev?.data).toBe('2024-02-29');
    expect(fev?.descricao).toContain('ajustado de 31 para 29');
  });

  it('contrato de 6 meses → 7 visitas (inicial + 6 mensais)', () => {
    const os = calcularDatasPresencial({
      contratoInicio: utc('2026-07-15'),
      contratoFim: utc('2027-01-15'),
    });
    expect(os).toHaveLength(7);
    expect(os.map((o) => o.data)).toEqual([
      '2026-07-15', '2026-08-15', '2026-09-15', '2026-10-15',
      '2026-11-15', '2026-12-15', '2027-01-15',
    ]);
  });

  it('mês ímpar vs mês par: paridade não afeta presencial (contagem igual)', () => {
    const impar = calcularDatasPresencial({
      contratoInicio: utc('2026-01-10'), // jan = ímpar
      contratoFim: utc('2026-06-10'),
    });
    const par = calcularDatasPresencial({
      contratoInicio: utc('2026-02-10'), // fev = par
      contratoFim: utc('2026-07-10'),
    });
    expect(impar).toHaveLength(6);
    expect(par).toHaveLength(6);
    // Ambos contém só visita_tecnica_*; sem 'equalização' (não existe no presencial)
    expect(impar.every((o) => o.tipo.startsWith('visita_tecnica_'))).toBe(true);
    expect(par.every((o) => o.tipo.startsWith('visita_tecnica_'))).toBe(true);
  });

  it('cruzamento de ano (nov 2026 → abr 2027)', () => {
    const os = calcularDatasPresencial({
      contratoInicio: utc('2026-11-20'),
      contratoFim: utc('2027-04-20'),
    });
    expect(os.map((o) => o.data)).toEqual([
      '2026-11-20', '2026-12-20', '2027-01-20', '2027-02-20',
      '2027-03-20', '2027-04-20',
    ]);
    expect(os).toHaveLength(6);
  });

  it('throw se contratoFim < contratoInicio', () => {
    expect(() =>
      calcularDatasPresencial({ contratoInicio: utc('2026-05-01'), contratoFim: utc('2026-04-30') }),
    ).toThrow(/contratoFim/);
  });
});
