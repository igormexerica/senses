import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcularDatasRemoto } from '../src/calculators/remoto.js';
import { clearFeriados, setupFeriados, utc } from './_helpers.js';

beforeAll(() => setupFeriados());
afterAll(() => clearFeriados());

describe('calcularDatasRemoto', () => {
  it('mês ímpar (jan 2026): dataCalculada preservada, efetiva = dia 01 do mês ajustada pra dia útil', async () => {
    const os = await calcularDatasRemoto({
      contratoInicio: utc('2026-01-15'),
      contratoFim: utc('2027-01-15'),
    });
    // Inicial: cálculo 2026-01-15 → dia 01 = 2026-01-01 (feriado) → 2026-01-02 (sex)
    expect(os[0]).toEqual({
      tipo: 'envio_refil_inicial',
      data: '2026-01-02',
      dataCalculada: '2026-01-15',
      descricao: 'Envio inicial (conclusão do onboarding)',
    });
    expect(os.find((o) => o.tipo === 'envio_refil_equalizacao')).toBeUndefined();
    // Primeira regular: 2026-03-16 → 03-01 (dom) → 03-02 (seg)
    expect(os[1]).toMatchObject({
      tipo: 'envio_refil_regular',
      data: '2026-03-02',
      dataCalculada: '2026-03-16',
    });
  });

  it('mês ímpar (jan 2026), 12 meses: total 7 OS com datas efetivas no dia útil', async () => {
    const os = await calcularDatasRemoto({
      contratoInicio: utc('2026-01-15'),
      contratoFim: utc('2027-01-15'),
    });
    expect(os).toHaveLength(7);
    expect(os.filter((o) => o.tipo === 'envio_refil_inicial')).toHaveLength(1);
    expect(os.filter((o) => o.tipo === 'envio_refil_regular')).toHaveLength(6);
    // Sequência efetiva (todas dia 01 ou primeiro dia útil seguinte):
    // jan: 01 fer → 02 sex
    // mar: 01 dom → 02 seg
    // mai: 01 sex fer → 04 seg (02 sab, 03 dom)
    // jul: 01 qua
    // set: 01 ter
    // nov: 01 dom → 02 seg fer → 03 ter
    // jan 2027: 01 sex fer → 04 seg (02 sab, 03 dom)
    expect(os.map((o) => o.data)).toEqual([
      '2026-01-02', '2026-03-02', '2026-05-04', '2026-07-01',
      '2026-09-01', '2026-11-03', '2027-01-04',
    ]);
  });

  it('mês par (fev 2026): gera inicial + equalização no dia 1 do próximo mês, ambos ajustados pra dia útil', async () => {
    const os = await calcularDatasRemoto({
      contratoInicio: utc('2026-02-15'),
      contratoFim: utc('2027-02-15'),
    });
    // Inicial: cálculo 02-15 → 02-01 (dom) → 02-02 (seg)
    expect(os[0]).toMatchObject({
      tipo: 'envio_refil_inicial',
      data: '2026-02-02',
      dataCalculada: '2026-02-15',
    });
    // Equalização: cálculo 03-01 → 03-01 já é dia 01 (dom) → 03-02 (seg)
    expect(os[1]).toMatchObject({
      tipo: 'envio_refil_equalizacao',
      data: '2026-03-02',
      dataCalculada: '2026-03-01',
      descricao: 'Envio de equalização (entrada no calendário ímpar)',
    });
  });

  it('mês par (fev 2026), 12 meses: total 7 OS, sequência completa', async () => {
    const os = await calcularDatasRemoto({
      contratoInicio: utc('2026-02-15'),
      contratoFim: utc('2027-02-15'),
    });
    expect(os).toHaveLength(7);
    expect(os.filter((o) => o.tipo === 'envio_refil_equalizacao')).toHaveLength(1);
    // Sequência efetiva (cálculo: fev15, mar1, abr30, jun29, ago28, out27, dez26)
    // → fev01 dom→seg02, mar01 dom→seg02, abr01 qua, jun01 seg, ago01 sab→seg03, out01 qui, dez01 ter
    expect(os.map((o) => o.data)).toEqual([
      '2026-02-02', '2026-03-02', '2026-04-01', '2026-06-01',
      '2026-08-03', '2026-10-01', '2026-12-01',
    ]);
  });

  it('contrato curto (30d, mar 2026): só o inicial cabe, ajustado pra dia útil', async () => {
    const os = await calcularDatasRemoto({
      contratoInicio: utc('2026-03-01'),
      contratoFim: utc('2026-03-31'),
    });
    expect(os).toHaveLength(1);
    // 03-01 (dom) → 03-02 (seg)
    expect(os[0]).toMatchObject({
      tipo: 'envio_refil_inicial',
      data: '2026-03-02',
      dataCalculada: '2026-03-01',
    });
  });

  it('cruza virada de ano (set 2026 → fev 2027): cadência +60d respeitada e dia 01 aplicado', async () => {
    const os = await calcularDatasRemoto({
      contratoInicio: utc('2026-09-01'),
      contratoFim: utc('2027-02-28'),
    });
    // Cálculo: set 1 (set ímpar), out 31, dez 30, fev 28 — todos dentro contratoFim
    // Efetiva: set 01 ter, out 01 qui, dez 01 ter, fev 01 (2027) seg
    expect(os.map((o) => o.data)).toEqual([
      '2026-09-01', '2026-10-01', '2026-12-01', '2027-02-01',
    ]);
    expect(os.filter((o) => o.tipo === 'envio_refil_equalizacao')).toHaveLength(0);
  });

  it('ano bissexto: cálculo jan 1 2024 + 60d = mar 1 (não mar 2) — verifica via dataCalculada', async () => {
    const bissexto = await calcularDatasRemoto({
      contratoInicio: utc('2024-01-01'),
      contratoFim: utc('2024-06-30'),
    });
    // Inicial: 2024-01-01 (seg, feriado) → 2024-01-02 (ter)
    expect(bissexto[0]).toMatchObject({ data: '2024-01-02', dataCalculada: '2024-01-01' });
    // Primeira regular: cálculo +60d = mar 1 (em ano bissexto, fev tem 29 dias)
    expect(bissexto[1]).toMatchObject({
      tipo: 'envio_refil_regular',
      dataCalculada: '2024-03-01',
    });

    // Comparação não-bissexto: 2025 jan 1 + 60d = mar 2 (fev tem 28 dias)
    const naoBissexto = await calcularDatasRemoto({
      contratoInicio: utc('2025-01-01'),
      contratoFim: utc('2025-06-30'),
    });
    expect(naoBissexto[1]).toMatchObject({
      tipo: 'envio_refil_regular',
      dataCalculada: '2025-03-02',
    });
  });

  it('throw se contratoFim < contratoInicio', async () => {
    await expect(
      calcularDatasRemoto({ contratoInicio: utc('2026-05-01'), contratoFim: utc('2026-04-30') }),
    ).rejects.toThrow(/contratoFim/);
  });
});
