import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcularDatasRemoto } from '../src/calculators/remoto.js';
import { clearFeriados, setupFeriados, utc } from './_helpers.js';

beforeAll(() => setupFeriados());
afterAll(() => clearFeriados());

const DESC_EQUAL = '⚠️ EQUALIZAÇÃO — Cliente iniciou em mês par. Conferir qtde reduzida com CS.';

describe('calcularDatasRemoto (v3)', () => {
  it('mês ímpar (17/03/2026): inicial na data + 5 recorrentes a cada 2 meses, sem equalização', async () => {
    const os = await calcularDatasRemoto({
      contratoInicio: utc('2026-03-17'),
      contratoFim: utc('2027-02-15'),
    });
    expect(os).toHaveLength(6);
    expect(os.filter((o) => o.tipo === 'envio_refil_equalizacao')).toHaveLength(0);

    // Inicial: 17/03/2026 ter — dia útil, efetiva = calc
    expect(os[0]).toEqual({
      tipo: 'envio_refil_inicial',
      data: '2026-03-17',
      dataCalculada: '2026-03-17',
      descricao: 'Envio inicial (conclusão do onboarding)',
    });

    // Recorrentes (calc): 17/05, 17/07, 17/09, 17/11, 17/01/2027
    expect(os.slice(1).map((o) => o.dataCalculada)).toEqual([
      '2026-05-17', '2026-07-17', '2026-09-17', '2026-11-17', '2027-01-17',
    ]);

    // Efetivas: 17/05 dom→18/05 seg, 17/07 sex, 17/09 qui, 17/11 ter, 17/01/2027 dom→18/01 seg
    expect(os.slice(1).map((o) => o.data)).toEqual([
      '2026-05-18', '2026-07-17', '2026-09-17', '2026-11-17', '2027-01-18',
    ]);
  });

  it('mês par (17/02/2026): inicial + equalização (mesmo dia próximo mês) + recorrentes', async () => {
    const os = await calcularDatasRemoto({
      contratoInicio: utc('2026-02-17'),
      contratoFim: utc('2027-02-15'),
    });
    expect(os).toHaveLength(7);

    // Inicial: 17/02/2026 ter — Carnaval (feriado) → 18/02 qua
    expect(os[0]).toMatchObject({
      tipo: 'envio_refil_inicial',
      data: '2026-02-18',
      dataCalculada: '2026-02-17',
    });
    // Equalização: 17/03 (ter) — dia útil. Descrição EXATA com ⚠️
    expect(os[1]).toEqual({
      tipo: 'envio_refil_equalizacao',
      data: '2026-03-17',
      dataCalculada: '2026-03-17',
      descricao: DESC_EQUAL,
    });

    // Recorrentes a partir da âncora 17/03 + 2N meses
    expect(os.slice(2).map((o) => o.dataCalculada)).toEqual([
      '2026-05-17', '2026-07-17', '2026-09-17', '2026-11-17', '2027-01-17',
    ]);
    expect(os.slice(2).map((o) => o.data)).toEqual([
      '2026-05-18', '2026-07-17', '2026-09-17', '2026-11-17', '2027-01-18',
    ]);
  });

  it('mês ímpar dia 31 (31/01/2026): clamp preserva dia 31 nos meses longos, desliza nos curtos', async () => {
    const os = await calcularDatasRemoto({
      contratoInicio: utc('2026-01-31'),
      contratoFim: utc('2027-02-15'),
    });
    // Inicial: 31/01 sáb → 02/02 seg
    expect(os[0]).toMatchObject({
      tipo: 'envio_refil_inicial',
      data: '2026-02-02',
      dataCalculada: '2026-01-31',
    });

    // Sequência das recorrentes a cada 2 meses (âncora = 31/01):
    // +2m = mar 31 (ok), +4m = mai 31 (ok), +6m = jul 31 (ok),
    // +8m = set 30 (clamp), +10m = nov 30 (clamp), +12m = jan 31/27 (ok)
    expect(os.slice(1).map((o) => o.dataCalculada)).toEqual([
      '2026-03-31', '2026-05-31', '2026-07-31', '2026-09-30', '2026-11-30', '2027-01-31',
    ]);
    // Efetivas: 31/03 ter, 31/05 dom→01/06 seg, 31/07 sex, 30/09 qua, 30/11 seg, 31/01/27 dom→01/02 seg
    expect(os.slice(1).map((o) => o.data)).toEqual([
      '2026-03-31', '2026-06-01', '2026-07-31', '2026-09-30', '2026-11-30', '2027-02-01',
    ]);
    expect(os).toHaveLength(7);
  });

  it('mês par dia 28 (28/02/2026 não-bissexto): inicial → equalização → recorrentes mantendo dia 28', async () => {
    const os = await calcularDatasRemoto({
      contratoInicio: utc('2026-02-28'),
      contratoFim: utc('2027-03-15'),
    });
    expect(os).toHaveLength(7);

    // Inicial: 28/02 sáb → 02/03 seg
    expect(os[0]).toMatchObject({ data: '2026-03-02', dataCalculada: '2026-02-28' });
    // Equalização: addMonthsClampedUTC(28/02, 1) = 28/03 sáb → 30/03 seg
    expect(os[1]).toMatchObject({
      data: '2026-03-30',
      dataCalculada: '2026-03-28',
      descricao: DESC_EQUAL,
    });

    // Recorrentes: âncora 28/03 + 2N meses. Dia 28 cabe em todos (mai/jul/set/nov/jan)
    expect(os.slice(2).map((o) => o.dataCalculada)).toEqual([
      '2026-05-28', '2026-07-28', '2026-09-28', '2026-11-28', '2027-01-28',
    ]);
    // Efetivas: 28/05 qui, 28/07 ter, 28/09 seg, 28/11 sáb→30/11 seg, 28/01 qui
    expect(os.slice(2).map((o) => o.data)).toEqual([
      '2026-05-28', '2026-07-28', '2026-09-28', '2026-11-30', '2027-01-28',
    ]);
  });

  it('contrato curto (01/03/2026, fim 31/03/2026): só inicial cabe', async () => {
    const os = await calcularDatasRemoto({
      contratoInicio: utc('2026-03-01'),
      contratoFim: utc('2026-03-31'),
    });
    expect(os).toHaveLength(1);
    // Inicial: 01/03 dom → 02/03 seg
    expect(os[0]).toMatchObject({
      tipo: 'envio_refil_inicial',
      data: '2026-03-02',
      dataCalculada: '2026-03-01',
    });
    // Próxima seria 01/05 (> 31/03) — confirma que não foi gerada
    expect(os.filter((o) => o.tipo === 'envio_refil_regular')).toHaveLength(0);
  });

  it('cruza virada de ano (17/11/2026 ímpar, fim 28/02/2027): captura 1 recorrente em 17/01/2027', async () => {
    const os = await calcularDatasRemoto({
      contratoInicio: utc('2026-11-17'),
      contratoFim: utc('2027-02-28'),
    });
    expect(os).toHaveLength(2);
    // Inicial: 17/11 ter — dia útil
    expect(os[0]).toMatchObject({ data: '2026-11-17', dataCalculada: '2026-11-17' });
    // Recorrente: 17/01/2027 dom → 18/01/2027 seg
    expect(os[1]).toMatchObject({
      tipo: 'envio_refil_regular',
      data: '2027-01-18',
      dataCalculada: '2027-01-17',
    });
  });

  it('equalização carrega a descrição EXATA com ⚠️ pra triagem da CS', async () => {
    const os = await calcularDatasRemoto({
      contratoInicio: utc('2026-04-10'),
      contratoFim: utc('2026-06-30'),
    });
    const equalizacao = os.find((o) => o.tipo === 'envio_refil_equalizacao');
    expect(equalizacao).toBeDefined();
    expect(equalizacao?.descricao).toBe(DESC_EQUAL);
    expect(equalizacao?.descricao).toContain('⚠️ EQUALIZAÇÃO');
  });

  it('throw se contratoFim < contratoInicio', async () => {
    await expect(
      calcularDatasRemoto({ contratoInicio: utc('2026-05-01'), contratoFim: utc('2026-04-30') }),
    ).rejects.toThrow(/contratoFim/);
  });
});
