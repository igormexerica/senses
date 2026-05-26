import { describe, expect, it } from 'vitest';
import { buildRecurrenceJob } from '../src/lib/recurrence-queue.js';
import { FIELD_SERVICE_NAMES } from '../src/lib/field-control.js';

describe('buildRecurrenceJob', () => {
  it('Remoto → ENVIO BIMESTRAL DE RECARGA, frequencyValue=2', () => {
    const job = buildRecurrenceJob({
      dealId: 'deal_abc',
      pipeline: 'onboarding_remoto',
      fieldCustomerName: 'Cliente X',
      fieldCustomerId: 'cust_123',
      startsAt: '2026-05-26',
    });
    expect(job.serviceTypeName).toBe(FIELD_SERVICE_NAMES.REMOTO_ENVIO_RECARGA);
    expect(job.frequencyUnit).toBe('months');
    expect(job.frequencyValue).toBe(2);
  });

  it('Presencial → MANUTENÇÃO MENSAL, frequencyValue=1', () => {
    const job = buildRecurrenceJob({
      dealId: 'deal_def',
      pipeline: 'onboarding_presencial',
      fieldCustomerName: 'Cliente Y',
      fieldCustomerId: 'cust_456',
      startsAt: '2026-05-26',
    });
    expect(job.serviceTypeName).toBe(FIELD_SERVICE_NAMES.PRESENCIAL_MANUTENCAO);
    expect(job.frequencyUnit).toBe('months');
    expect(job.frequencyValue).toBe(1);
  });

  it('skipWeekends sempre true (por enquanto)', () => {
    const remoto = buildRecurrenceJob({
      dealId: 'd1',
      pipeline: 'onboarding_remoto',
      fieldCustomerName: 'A',
      fieldCustomerId: 'a',
      startsAt: '2026-05-26',
    });
    const presencial = buildRecurrenceJob({
      dealId: 'd2',
      pipeline: 'onboarding_presencial',
      fieldCustomerName: 'B',
      fieldCustomerId: 'b',
      startsAt: '2026-05-26',
    });
    expect(remoto.skipWeekends).toBe(true);
    expect(presencial.skipWeekends).toBe(true);
  });

  it('endsAt sempre null (Senses controla rescisão manual)', () => {
    const job = buildRecurrenceJob({
      dealId: 'd1',
      pipeline: 'onboarding_remoto',
      fieldCustomerName: 'X',
      fieldCustomerId: 'x',
      startsAt: '2026-05-26',
    });
    expect(job.endsAt).toBeNull();
  });

  it('propaga campos do input sem mutação', () => {
    const job = buildRecurrenceJob({
      dealId: 'deal_xyz',
      pipeline: 'onboarding_remoto',
      fieldCustomerName: 'Indústria Tal',
      fieldCustomerId: 'MTIzNDU2',
      startsAt: '2026-06-15',
    });
    expect(job.dealId).toBe('deal_xyz');
    expect(job.pipeline).toBe('onboarding_remoto');
    expect(job.fieldCustomerName).toBe('Indústria Tal');
    expect(job.fieldCustomerId).toBe('MTIzNDU2');
    expect(job.startsAt).toBe('2026-06-15');
  });

  it('description inclui pipeline e fonte do gatilho', () => {
    const job = buildRecurrenceJob({
      dealId: 'd',
      pipeline: 'onboarding_presencial',
      fieldCustomerName: 'X',
      fieldCustomerId: 'x',
      startsAt: '2026-05-26',
    });
    expect(job.description).toMatch(/onboarding_presencial/);
    expect(job.description).toMatch(/Definição de Fragrância/);
  });
});
