/**
 * Captura screenshots das 4 telas do Sentinel logado como gestor + vendedor.
 *
 * Pré-requisito: dev server rodando em http://localhost:3000
 * Saída: /tmp/sentinel-screenshots/{user}-{screen}.png
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "/tmp/sentinel-screenshots";

mkdirSync(OUT, { recursive: true });

function readCreds() {
  const txt = readFileSync("/root/sentinel/.dev-credentials", "utf8");
  const creds = {};
  for (const line of txt.split("\n")) {
    if (line.startsWith("#") || !line.trim()) continue;
    const m = line.match(/^(\S+@\S+)\s+(\S+)/);
    if (m) creds[m[1]] = m[2];
  }
  return creds;
}

async function login(page, email, password) {
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error(`  [browser]: ${msg.text()}`);
  });
  page.on("pageerror", (err) => console.error(`  [pageerror]: ${err.message}`));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });

  const emailInput = page.locator("#email");
  await emailInput.click();
  await emailInput.pressSequentially(email, { delay: 20 });

  const pwInput = page.locator("#password");
  await pwInput.click();
  await pwInput.pressSequentially(password, { delay: 20 });

  await page.waitForTimeout(200);
  await page.locator('button[type="submit"]').click();

  try {
    await page.waitForURL(/\/home$/, { timeout: 15_000 });
  } catch (e) {
    const errPath = `${OUT}/login-error.png`;
    await page.screenshot({ path: errPath, fullPage: true });
    const errText = await page
      .locator('[role="alert"]')
      .textContent()
      .catch(() => "(sem alert)");
    console.error(`  ✗ login falhou. URL atual: ${page.url()}`);
    console.error(`  alert text: ${errText}`);
    console.error(`  debug screenshot: ${errPath}`);
    throw e;
  }
}

async function shot(page, name) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`  📸 ${path}`);
  return path;
}

async function captureFor(user, password, prefix) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/usr/bin/google-chrome",
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
  });
  const page = await context.newPage();

  console.log(`\n── ${prefix.toUpperCase()} (${user}) ──`);

  await login(page, user, password);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, `${prefix}-1-home`);

  // Clica no primeiro lead da tabela pra abrir detalhe
  const leadLink = page.locator("table tbody tr a").first();
  const leadCount = await page.locator("table tbody tr").count();
  console.log(`  rows na tabela: ${leadCount}`);
  if (leadCount > 0) {
    await leadLink.click();
    await page.waitForURL(/\/leads\/.+/, { timeout: 10_000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(800);
    await shot(page, `${prefix}-2-lead-detail`);
  } else {
    console.log("  ⚠ sem leads pra abrir");
  }

  await page.goto(`${BASE}/quality`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, `${prefix}-3-quality`);

  await browser.close();
}

const creds = readCreds();
const gestorPass = creds["gestor@sentinel.dev"];
const vendedorPass = creds["vendedor@sentinel.dev"];

if (!gestorPass || !vendedorPass) {
  console.error("Credenciais não encontradas em /root/sentinel/.dev-credentials");
  process.exit(1);
}

// Login page (sem auth)
{
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/usr/bin/google-chrome",
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, "0-login");
  await browser.close();
}

await captureFor("vendedor@sentinel.dev", vendedorPass, "vendedor");
await captureFor("gestor@sentinel.dev", gestorPass, "gestor");

console.log(`\nScreenshots salvos em ${OUT}/`);
