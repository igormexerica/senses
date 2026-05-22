import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcularDatasPresencial } from '../src/calculators/presencial.js';
import { clearFeriados, setupFeriados, utc } from './_helpers.js';

beforeAll(() => setupFeriados());
afterAll(() => clearFeriados());

describe('calcularDatasPresencial (v3)', () => {
  it('instalação dia comum (15/03/2026 dom, 6 meses): inicial 16/03 + recorrentes dia 01', async () => {
    const os = await calcularDatasPresencial({
      contratoInicio: utc('2026-03-15'),
      contratoFim: utc('2026-09-15'),
    });
    expect(os).toHaveLength(7);

    // Inicial: 15/03 dom → 16/03 seg
    expect(os[0]).toEqual({
      tipo: 'visita_tecnica_inicial',
      data: '2026-03-16',
      dataCalculada: '2026-03-15',
      descricao: 'Visita técnica inicial (instalação)',
    });

    // Recorrentes: calc sempre dia 01 do mês seguinte
    expect(os.slice(1).map((o) => o.dataCalculada)).toEqual([
      '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01',
    ]);
    // Efetivas: 01/04 qua, 01/05 sex(fer)→04/05 seg, 01/06 seg, 01/07 qua,
    //           01/08 sáb→03/08 seg, 01/09 ter
    expect(os.slice(1).map((o) => o.data)).toEqual([
      '2026-04-01', '2026-05-04', '2026-06-01', '2026-07-01', '2026-08-03', '2026-09-01',
    ]);
  });

  it('instalação dia 01 (01/06/2026 seg, 3 meses): inicial não desloca; recorrentes dia 01', async () => {
    const os = await calcularDatasPresencial({
      contratoInicio: utc('2026-06-01'),
      contratoFim: utc('2026-09-01'),
    });
    expect(os).toHaveLength(4);
    expect(os[0]).toMatchObject({ data: '2026-06-01', dataCalculada: '2026-06-01' });
    expect(os.slice(1).map((o) => o.dataCalculada)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01']);
    // 01/07 qua, 01/08 sáb→03/08 seg, 01/09 ter
    expect(os.slice(1).map((o) => o.data)).toEqual(['2026-07-01', '2026-08-03', '2026-09-01']);
  });

  it('instalação dia 31 (31/01/2026 sáb): inicial 02/02; primeira recorrente 02/03 (não 02/02)', async () => {
    const os = await calcularDatasPresencial({
      contratoInicio: utc('2026-01-31'),
      contratoFim: utc('2026-04-30'),
    });
    expect(os).toHaveLength(3);
    // Inicial: 31/01 sáb → 02/02 seg
    expect(os[0]).toMatchObject({ data: '2026-02-02', dataCalculada: '2026-01-31' });
    // Primeira recorrente PULA fevereiro (calc 01/02 → ef 02/02 colide com inicial)
    // → calc 01/03 dom → ef 02/03 seg
    expect(os[1]).toMatchObject({
      tipo: 'visita_tecnica_regular',
      data: '2026-03-02',
      dataCalculada: '2026-03-01',
    });
    // Segunda recorrente: 01/04 qua
    expect(os[2]).toMatchObject({ data: '2026-04-01', dataCalculada: '2026-04-01' });
  });

  it('detecção de colisão explícita: instalação 31/01/2026, primeira recorrente pula fev e marca descrição', async () => {
    const os = await calcularDatasPresencial({
      contratoInicio: utc('2026-01-31'),
      contratoFim: utc('2026-04-30'),
    });
    // A primeira recorrente (os[1]) deve ter calc=01/03 (fevereiro pulado),
    // não calc=01/02 (que daria a mesma efetiva da inicial)
    expect(os[1]?.dataCalculada).toBe('2026-03-01');
    expect(os[1]?.dataCalculada).not.toBe('2026-02-01');
    // E a descrição deve marcar o ajuste pra triagem da CS
    expect(os[1]?.descricao).toContain('colisão');
    expect(os[1]?.descricao).toBe(
      'Visita técnica mensal (data ajustada pra evitar colisão com instalação)',
    );
    // Demais recorrentes voltam à descrição padrão (sem marca de colisão)
    expect(os[2]?.descricao).toBe('Visita técnica mensal');
  });

  it('instalação em FDS (14/03/2026 sáb): inicial 16/03 seg (pula domingo)', async () => {
    const os = await calcularDatasPresencial({
      contratoInicio: utc('2026-03-14'),
      contratoFim: utc('2026-05-30'),
    });
    // Inicial: 14/03 sáb → 15/03 dom → 16/03 seg
    expect(os[0]).toMatchObject({ data: '2026-03-16', dataCalculada: '2026-03-14' });
    // Recorrentes: firstDayOfNextMonth(16/03) = 01/04 qua, depois 01/05 sex fer → 04/05 seg
    expect(os.slice(1).map((o) => o.data)).toEqual(['2026-04-01', '2026-05-04']);
    expect(os).toHaveLength(3);
  });

  it('recorrente dia 01 cai em 01/01/2027 (Confraternização) + fim de semana: vira 04/01/2027', async () => {
    const os = await calcularDatasPresencial({
      contratoInicio: utc('2026-12-15'), // ter, dia útil
      contratoFim: utc('2027-02-15'),
    });
    // Inicial: 15/12/2026 ter → 15/12
    expect(os[0]).toMatchObject({ data: '2026-12-15', dataCalculada: '2026-12-15' });
    // Recorrente 1: 01/01/2027 sex feriado → 02/01 sáb → 03/01 dom → 04/01 seg
    expect(os[1]).toMatchObject({
      data: '2027-01-04',
      dataCalculada: '2027-01-01',
    });
    // Recorrente 2: 01/02/2027 seg
    expect(os[2]).toMatchObject({ data: '2027-02-01', dataCalculada: '2027-02-01' });
    expect(os).toHaveLength(3);
  });

  it('cruzamento de ano (15/11/2026 dom + fer Proclamação → fim 15/03/2027)', async () => {
    const os = await calcularDatasPresencial({
      contratoInicio: utc('2026-11-15'),
      contratoFim: utc('2027-03-15'),
    });
    expect(os).toHaveLength(5);
    // Inicial: 15/11 dom + feriado → 16/11 seg
    expect(os[0]).toMatchObject({ data: '2026-11-16', dataCalculada: '2026-11-15' });
    // Recorrentes: 01/12 ter, 01/01/2027 sex fer→04/01 seg, 01/02 seg, 01/03 seg
    expect(os.slice(1).map((o) => o.dataCalculada)).toEqual([
      '2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01',
    ]);
    expect(os.slice(1).map((o) => o.data)).toEqual([
      '2026-12-01', '2027-01-04', '2027-02-01', '2027-03-01',
    ]);
  });

  it('throw se contratoFim < contratoInicio', async () => {
    await expect(
      calcularDatasPresencial({ contratoInicio: utc('2026-05-01'), contratoFim: utc('2026-04-30') }),
    ).rejects.toThrow(/contratoFim/);
  });
});
