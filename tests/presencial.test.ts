import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcularDatasPresencial } from '../src/calculators/presencial.js';
import { clearFeriados, setupFeriados, utc } from './_helpers.js';

beforeAll(() => setupFeriados());
afterAll(() => clearFeriados());

describe('calcularDatasPresencial', () => {
  it('contrato 12 meses dia 15 (jan 2026): mantém dia da criação; ajusta só weekend/feriado', async () => {
    const os = await calcularDatasPresencial({
      contratoInicio: utc('2026-01-15'),
      contratoFim: utc('2027-01-15'),
    });
    expect(os).toHaveLength(13);
    expect(os.filter((o) => o.tipo === 'visita_tecnica_inicial')).toHaveLength(1);
    expect(os.filter((o) => o.tipo === 'visita_tecnica_regular')).toHaveLength(12);
    // Inicial: 2026-01-15 (qui) — dia útil, não muda
    expect(os[0]).toMatchObject({ data: '2026-01-15', dataCalculada: '2026-01-15' });
    // Última: 2027-01-15 (sex) — dia útil
    expect(os.at(-1)?.data).toBe('2027-01-15');
  });

  it('contrato 12 meses dia 15: feb-15 cai em dom + carnaval segue → 18; nov-15 dom + feriado seg → 16', async () => {
    const os = await calcularDatasPresencial({
      contratoInicio: utc('2026-01-15'),
      contratoFim: utc('2027-01-15'),
    });
    // fev: cálculo 02-15 dom → 02-16 seg (carnaval) → 02-17 ter (carnaval) → 02-18 qua
    const fev = os.find((o) => o.dataCalculada === '2026-02-15');
    expect(fev?.data).toBe('2026-02-18');
    // nov: cálculo 11-15 dom (Proclamação) → 11-16 seg
    const nov = os.find((o) => o.dataCalculada === '2026-11-15');
    expect(nov?.data).toBe('2026-11-16');
    // ago: cálculo 08-15 sab → seg 17 (dia útil)
    const ago = os.find((o) => o.dataCalculada === '2026-08-15');
    expect(ago?.data).toBe('2026-08-17');
  });

  it('início dia 31: clamp em fev + ajuste pra dia útil (sab/dom)', async () => {
    const os = await calcularDatasPresencial({
      contratoInicio: utc('2026-01-31'),
      contratoFim: utc('2026-08-31'),
    });
    // Cálculo: jan31 sab, fev28 sab (clamp de 31), mar31 ter, abr30 qui (clamp), mai31 dom,
    //          jun30 ter (clamp), jul31 sex, ago31 seg
    // Efetiva: fev02 seg, mar02 seg, mar31 ter, abr30 qui, jun01 seg, jun30 ter, jul31 sex, ago31 seg
    expect(os.map((o) => o.data)).toEqual([
      '2026-02-02', '2026-03-02', '2026-03-31', '2026-04-30',
      '2026-06-01', '2026-06-30', '2026-07-31', '2026-08-31',
    ]);
    expect(os).toHaveLength(8);
    // Verifica que o clamp ainda é registrado na descricao
    const fev = os.find((o) => o.dataCalculada === '2026-02-28');
    expect(fev?.descricao).toContain('ajustado de 31 para 28');
  });

  it('ano bissexto: dia 31 cai em fev 29 (clamp), e ajustado pra dia útil se preciso', async () => {
    const os = await calcularDatasPresencial({
      contratoInicio: utc('2024-01-31'),
      contratoFim: utc('2024-03-31'),
    });
    // 2024-02-29 (clamp do 31) = qui — dia útil ✓
    const fev = os.find((o) => o.tipo === 'visita_tecnica_regular' && o.dataCalculada === '2024-02-29');
    expect(fev?.data).toBe('2024-02-29');
    expect(fev?.descricao).toContain('ajustado de 31 para 29');
  });

  it('contrato 6 meses (jul 2026): mantém dia 15 quando dia útil', async () => {
    const os = await calcularDatasPresencial({
      contratoInicio: utc('2026-07-15'),
      contratoFim: utc('2027-01-15'),
    });
    expect(os).toHaveLength(7);
    // Cálculo: jul15 qua, ago15 sab, set15 ter, out15 qui, nov15 dom (fer), dez15 ter, jan15/27 sex
    // Efetiva: jul15, ago17 (sab→seg), set15, out15, nov16, dez15, jan15
    expect(os.map((o) => o.data)).toEqual([
      '2026-07-15', '2026-08-17', '2026-09-15', '2026-10-15',
      '2026-11-16', '2026-12-15', '2027-01-15',
    ]);
  });

  it('mês ímpar vs par: paridade não afeta presencial (contagem igual)', async () => {
    const impar = await calcularDatasPresencial({
      contratoInicio: utc('2026-01-10'),
      contratoFim: utc('2026-06-10'),
    });
    const par = await calcularDatasPresencial({
      contratoInicio: utc('2026-02-10'),
      contratoFim: utc('2026-07-10'),
    });
    expect(impar).toHaveLength(6);
    expect(par).toHaveLength(6);
    expect(impar.every((o) => o.tipo.startsWith('visita_tecnica_'))).toBe(true);
    expect(par.every((o) => o.tipo.startsWith('visita_tecnica_'))).toBe(true);
  });

  it('cruzamento de ano (nov 2026 → abr 2027): dia 20 mantido quando dia útil', async () => {
    const os = await calcularDatasPresencial({
      contratoInicio: utc('2026-11-20'),
      contratoFim: utc('2027-04-20'),
    });
    expect(os).toHaveLength(6);
    // Cálculo: nov20 sex (fer Consc), dez20 dom, jan20 qua, fev20 sab, mar20 sab, abr20 ter
    // Efetiva: nov23 (20=fer→21sab→22dom→23seg), dez21, jan20, fev22, mar22, abr20
    expect(os.map((o) => o.data)).toEqual([
      '2026-11-23', '2026-12-21', '2027-01-20', '2027-02-22',
      '2027-03-22', '2027-04-20',
    ]);
  });

  it('throw se contratoFim < contratoInicio', async () => {
    await expect(
      calcularDatasPresencial({ contratoInicio: utc('2026-05-01'), contratoFim: utc('2026-04-30') }),
    ).rejects.toThrow(/contratoFim/);
  });
});
