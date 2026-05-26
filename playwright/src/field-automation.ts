import { promises as fs } from 'node:fs';
import path from 'node:path';
import { type Browser, type BrowserContext, type Page, chromium } from 'playwright';
import type { Logger } from 'pino';
import type { RecurrenceJob, RecurrenceResult } from './types.js';

const FIELD_BASE_URL = 'https://app.fieldcontrol.com.br';
const STATE_PATH = '/data/playwright-state/storage.json';
const FAILURES_DIR = '/data/playwright-failures';

const DEFAULT_TIMEOUT_MS = 15_000;

export interface AutomationDeps {
  fieldLoginEmail: string;
  fieldLoginPassword: string;
  headless: boolean;
  logger: Logger;
}

/**
 * Sessão Playwright reusável: carrega storage state se existir, valida se
 * ainda está logado, refaz login sob demanda. Não fecha o browser entre
 * jobs (worker mantém vivo enquanto consome a fila).
 */
export class FieldSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor(private readonly deps: AutomationDeps) {}

  async ensureReady(): Promise<Page> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: this.deps.headless });
    }
    if (!this.context) {
      this.context = await this.openContext();
    }
    const page = await this.context.newPage();
    page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);

    if (!(await this.isLoggedIn(page))) {
      this.deps.logger.info('session_not_logged_in_relogging');
      await this.login(page);
      await this.saveState();
    }
    return page;
  }

  async close(): Promise<void> {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    this.context = null;
    this.browser = null;
  }

  private async openContext(): Promise<BrowserContext> {
    if (!this.browser) throw new Error('browser_not_initialized');
    const hasState = await fileExists(STATE_PATH);
    return this.browser.newContext({
      ...(hasState ? { storageState: STATE_PATH } : {}),
      viewport: { width: 1366, height: 900 },
      locale: 'pt-BR',
    });
  }

  private async isLoggedIn(page: Page): Promise<boolean> {
    try {
      await page.goto(`${FIELD_BASE_URL}/#/recorrencias`, {
        waitUntil: 'domcontentloaded',
        timeout: DEFAULT_TIMEOUT_MS,
      });
      // Se redirecionou pra /login, não está logado.
      await page.waitForLoadState('networkidle', { timeout: DEFAULT_TIMEOUT_MS }).catch(() => undefined);
      const url = page.url();
      if (url.includes('/login') || url.includes('/auth')) return false;
      // Confirma presença de algum elemento autenticado.
      const authenticatedMarker = page.locator('text=Recorrências').first();
      return await authenticatedMarker
        .waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
    } catch {
      return false;
    }
  }

  private async login(page: Page): Promise<void> {
    await page.goto(`${FIELD_BASE_URL}/#/login`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel(/e-?mail/i).fill(this.deps.fieldLoginEmail);
    await page.getByLabel(/senha/i).fill(this.deps.fieldLoginPassword);
    await page.getByRole('button', { name: /entrar|login/i }).click();
    // Espera redirect pra dashboard. Se CAPTCHA aparecer, vai falhar aqui.
    await page.waitForURL((url) => !url.toString().includes('/login'), {
      timeout: 30_000,
    });
  }

  private async saveState(): Promise<void> {
    if (!this.context) return;
    await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
    await this.context.storageState({ path: STATE_PATH });
  }
}

/**
 * Cria uma Recorrência no Field via UI. Locators baseados em label/role
 * pra resistir a mudanças de classes CSS. Falhas tiram screenshot.
 *
 * IMPORTANTE: locators e nomes são **placeholders confirmáveis** —
 * antes do go-live Igor precisa abrir a tela manualmente e validar:
 *   - label "Cliente" (autocomplete? select?)
 *   - label "Tipo de OS"
 *   - label "Inicia em" / "Termina em"
 *   - label "Repete" / "A cada"
 *   - checkbox "Não considerar agendamentos em finais de semana"
 *   - botão "Criar"
 */
export async function createRecurrence(
  page: Page,
  job: RecurrenceJob,
  logger: Logger,
): Promise<RecurrenceResult> {
  const startedAt = Date.now();
  const failurePath = path.join(
    FAILURES_DIR,
    `${job.dealId}-${Date.now()}.png`,
  );

  try {
    await page.goto(`${FIELD_BASE_URL}/#/recorrencias/novo`, {
      waitUntil: 'domcontentloaded',
    });

    // Cliente — autocomplete por nome
    const clienteInput = page.getByLabel(/cliente/i).first();
    await clienteInput.click();
    await clienteInput.fill(job.fieldCustomerName);
    await page.getByRole('option', { name: new RegExp(escapeRegex(job.fieldCustomerName), 'i') })
      .first()
      .click();

    // Tipo de OS
    const tipoInput = page.getByLabel(/tipo (de )?os/i).first();
    await tipoInput.click();
    await tipoInput.fill(job.serviceTypeName);
    await page.getByRole('option', { name: new RegExp(escapeRegex(job.serviceTypeName), 'i') })
      .first()
      .click();

    // Descrição (opcional)
    if (job.description) {
      await page.getByLabel(/descri(ção|cao)/i).first().fill(job.description);
    }

    // Inicia em
    await page.getByLabel(/inicia em/i).first().fill(formatBR(job.startsAt));

    // Termina em (só se tiver)
    if (job.endsAt) {
      await page.getByLabel(/termina em/i).first().fill(formatBR(job.endsAt));
    }

    // Repete (unit) + A cada (value)
    const repeteOption = mapFrequencyUnitToOption(job.frequencyUnit);
    await page.getByLabel(/repete/i).first().click();
    await page.getByRole('option', { name: new RegExp(repeteOption, 'i') }).first().click();
    await page.getByLabel(/a cada/i).first().fill(String(job.frequencyValue));

    // Skip weekends toggle
    if (job.skipWeekends) {
      const toggle = page.getByLabel(/não considerar agendamentos em finais de semana/i).first();
      if (!(await toggle.isChecked().catch(() => false))) {
        await toggle.check();
      }
    }

    // Submit
    await page.getByRole('button', { name: /^criar$/i }).click();

    // Espera confirmação: URL muda OU toast aparece
    const success = await Promise.race([
      page
        .waitForURL((url) => /recorrencias\/[A-Za-z0-9+/=]+/.test(url.toString()), {
          timeout: 20_000,
        })
        .then(() => 'url_changed')
        .catch(() => null),
      page
        .getByText(/recorrência (criada|cadastrada)/i)
        .first()
        .waitFor({ state: 'visible', timeout: 20_000 })
        .then(() => 'toast')
        .catch(() => null),
    ]);

    if (!success) {
      throw new Error('post_submit_no_confirmation');
    }

    const fieldRecurrenceId = extractRecurrenceIdFromUrl(page.url()) ?? undefined;
    const result: RecurrenceResult = {
      ok: true,
      durationMs: Date.now() - startedAt,
    };
    if (fieldRecurrenceId) result.fieldRecurrenceId = fieldRecurrenceId;
    logger.info({ ...result, dealId: job.dealId }, 'recurrence_created');
    return result;
  } catch (err) {
    try {
      await fs.mkdir(FAILURES_DIR, { recursive: true });
      await page.screenshot({ path: failurePath, fullPage: true });
    } catch (screenshotErr) {
      logger.error({ err: screenshotErr }, 'screenshot_failed');
    }
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, dealId: job.dealId, screenshotPath: failurePath }, 'recurrence_failed');
    throw Object.assign(new Error(message), { screenshotPath: failurePath });
  }
}

function mapFrequencyUnitToOption(unit: 'days' | 'weeks' | 'months'): string {
  switch (unit) {
    case 'days':
      return 'dia';
    case 'weeks':
      return 'semana';
    case 'months':
      return 'm[eê]s';
  }
}

/** Converte 'YYYY-MM-DD' → 'DD/MM/YYYY' (formato brasileiro). */
function formatBR(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-');
  return `${d}/${m}/${y}`;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractRecurrenceIdFromUrl(url: string): string | null {
  const match = url.match(/recorrencias\/([A-Za-z0-9+/=_-]+)/);
  return match?.[1] ?? null;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
