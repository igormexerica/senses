import { describe, expect, it } from 'vitest';
import { calcularDatasRemoto } from '../src/calculators/remoto.js';

const utc = (yyyymmdd: string): Date => new Date(`${yyyymmdd}T00:00:00Z`);

describe('calcularDatasRemoto', () => {
  it('mês ímpar (jan): primeiro envio na data do contrato, sem equalização', () => {
    const os = calcularDatasRemoto({
      contratoInicio: utc('2026-01-15'),
      contratoFim: utc('2027-01-15'),
    });
    expect(os[0]).toEqual({
      tipo: 'envio_refil_inicial',
      data: '2026-01-15',
      descricao: 'Envio inicial (conclusão do onboarding)',
    });
    expect(os.find((o) => o.tipo === 'envio_refil_equalizacao')).toBeUndefined();
    // jan 15 + 60d = mar 16 (não-bissexto)
    expect(os[1]).toMatchObject({ tipo: 'envio_refil_regular', data: '2026-03-16' });
  });

  it('mês ímpar (jan), contrato de 12 meses → 1 inicial + 6 regulares = 7 OS', () => {
    const os = calcularDatasRemoto({
      contratoInicio: utc('2026-01-15'),
      contratoFim: utc('2027-01-15'),
    });
    expect(os).toHaveLength(7);
    expect(os.filter((o) => o.tipo === 'envio_refil_inicial')).toHaveLength(1);
    expect(os.filter((o) => o.tipo === 'envio_refil_regular')).toHaveLength(6);
    // Última OS dentro do contrato (jan 10 < jan 15)
    expect(os.at(-1)!.data).toBe('2027-01-10');
    // Sequência exata
    const datas = os.map((o) => o.data);
    expect(datas).toEqual([
      '2026-01-15', '2026-03-16', '2026-05-15', '2026-07-14',
      '2026-09-12', '2026-11-11', '2027-01-10',
    ]);
  });

  it('mês par (fev): gera inicial + equalização no dia 1º do próximo mês ímpar', () => {
    const os = calcularDatasRemoto({
      contratoInicio: utc('2026-02-15'),
      contratoFim: utc('2027-02-15'),
    });
    expect(os[0]).toMatchObject({ tipo: 'envio_refil_inicial', data: '2026-02-15' });
    expect(os[1]).toMatchObject({
      tipo: 'envio_refil_equalizacao',
      data: '2026-03-01',
      descricao: 'Envio de equalização (entrada no calendário ímpar)',
    });
    // Primeira regular = mar 1 + 60d = abr 30
    expect(os[2]).toMatchObject({ tipo: 'envio_refil_regular', data: '2026-04-30' });
  });

  it('mês par (fev), contrato de 12 meses → 1 inicial + 1 equalização + 5 regulares = 7 OS', () => {
    const os = calcularDatasRemoto({
      contratoInicio: utc('2026-02-15'),
      contratoFim: utc('2027-02-15'),
    });
    expect(os).toHaveLength(7);
    expect(os.filter((o) => o.tipo === 'envio_refil_equalizacao')).toHaveLength(1);
    expect(os.filter((o) => o.tipo === 'envio_refil_regular')).toHaveLength(5);
    expect(os.map((o) => o.data)).toEqual([
      '2026-02-15', '2026-03-01', '2026-04-30', '2026-06-29',
      '2026-08-28', '2026-10-27', '2026-12-26',
    ]);
  });

  it('contrato curto (30d em mês ímpar): só o inicial cabe', () => {
    const os = calcularDatasRemoto({
      contratoInicio: utc('2026-03-01'),
      contratoFim: utc('2026-03-31'),
    });
    expect(os).toHaveLength(1);
    expect(os[0]!.tipo).toBe('envio_refil_inicial');
    expect(os[0]!.data).toBe('2026-03-01');
  });

  it('cruza virada de ano (set 2026 → fev 2027): cadência +60d respeitada', () => {
    const os = calcularDatasRemoto({
      contratoInicio: utc('2026-09-01'),
      contratoFim: utc('2027-02-28'),
    });
    // set 1 (inicial, mês ímpar), +60d cadência: out 31, dez 30, fev 28
    expect(os.map((o) => o.data)).toEqual([
      '2026-09-01', '2026-10-31', '2026-12-30', '2027-02-28',
    ]);
    expect(os.filter((o) => o.tipo === 'envio_refil_equalizacao')).toHaveLength(0);
    // Última OS exatamente no contratoFim (inclusivo)
    expect(os.at(-1)!.data).toBe('2027-02-28');
  });

  it('ano bissexto: jan 1 2024 + 60d = mar 1 (não mar 2, porque fev tem 29 dias)', () => {
    const os = calcularDatasRemoto({
      contratoInicio: utc('2024-01-01'),
      contratoFim: utc('2024-06-30'),
    });
    expect(os[0]).toMatchObject({ data: '2024-01-01' });
    expect(os[1]).toMatchObject({ tipo: 'envio_refil_regular', data: '2024-03-01' });
    // Confirma diff vs. não-bissexto: 2025 (não-bissexto) seria mar 2
    const naoBissexto = calcularDatasRemoto({
      contratoInicio: utc('2025-01-01'),
      contratoFim: utc('2025-06-30'),
    });
    expect(naoBissexto[1]!.data).toBe('2025-03-02');
  });

  it('throw se contratoFim < contratoInicio', () => {
    expect(() =>
      calcularDatasRemoto({ contratoInicio: utc('2026-05-01'), contratoFim: utc('2026-04-30') }),
    ).toThrow(/contratoFim/);
  });
});
