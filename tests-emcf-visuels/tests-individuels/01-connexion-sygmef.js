const path = require('node:path');
const { chromium } = require('playwright');
const config = require('../config');
const { takeScreenshot, ensureDirSync } = require('../utils/screenshot-utils');
const { createTestRun, logStep, finishRun, saveTestReport } = require('../utils/report-utils');

const TEST_ID = '01-connexion';

function pickEnv() {
  // Par défaut: environnement test
  // Pour forcer prod: ENV=production node tests-individuels/01-connexion-sygmef.js
  const env = (process.env.ENV || 'test').toLowerCase();
  return env === 'production' ? config.production : config.test;
}

async function firstVisibleLocator(page, selectors) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    try {
      if (await loc.count()) {
        // On tente une petite vérification de visibilité (sans échouer si le DOM est lent)
        await loc.waitFor({ state: 'visible', timeout: 1500 }).catch(() => {});
        return loc;
      }
    } catch (_) {
      // ignore
    }
  }
  return null;
}

async function run() {
  const env = pickEnv();
  const timeoutMs = config.timeoutMs || 30_000;

  const projectRoot = path.resolve(__dirname, '..');
  const screenshotsBaseDir = path.join(projectRoot, config.screenshotDir);
  const reportsDir = path.join(projectRoot, config.reportsDir);

  ensureDirSync(screenshotsBaseDir);
  ensureDirSync(reportsDir);

  const runData = createTestRun(TEST_ID, {
    targetUrl: env.url,
    headless: config.headless,
    slowMoMs: config.slowMoMs,
  });

  const browser = await chromium.launch({
    headless: !!config.headless,
    slowMo: Number(config.slowMoMs || 0) || 0,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);

  let step = 0;
  const shotsBaseRel = config.screenshotDir;

  async function shot(label, title, details) {
    step += 1;
    const s = await takeScreenshot(page, {
      baseDir: screenshotsBaseDir,
      testId: TEST_ID,
      step,
      label,
      fullPage: true,
    });

    logStep(runData, {
      title: title || label,
      action: label,
      details,
      screenshots: [{ ...s, label }],
    });

    return s;
  }

  try {
    // 1) Accéder à la page login
    await page.goto(env.url, { waitUntil: 'domcontentloaded' });
    await shot('page-login', 'Page login chargée', { url: env.url });

    // 2) Localiser champs username / password (robuste)
    const username = await firstVisibleLocator(page, [
      'input[name="username"]',
      'input#username',
      'input[placeholder*="IFU" i]',
      'input[type="text"]',
    ]);

    const password = await firstVisibleLocator(page, [
      'input[name="password"]',
      'input#password',
      'input[type="password"]',
    ]);

    if (!username || !password) {
      await shot('erreur-selecteurs', 'Champs login introuvables', {
        usernameFound: !!username,
        passwordFound: !!password,
      });
      throw new Error('Impossible de trouver les champs username/password sur la page de connexion.');
    }

    // 3) Saisie credentials
    await username.fill(String(env.ifu || ''));
    await password.fill(String(env.password || ''));
    await shot('credentials-saisis', 'Credentials saisis', {
      ifuLength: String(env.ifu || '').length,
      passwordLength: String(env.password || '').length,
    });

    // 4) Cliquer se connecter
    const submit = await firstVisibleLocator(page, [
      'button:has-text("Se connecter")',
      'button:has-text("Connexion")',
      'input[type="submit"]',
      'button[type="submit"]',
    ]);

    if (!submit) {
      await shot('erreur-submit', 'Bouton de connexion introuvable');
      throw new Error('Impossible de trouver le bouton "Se connecter".');
    }

    await Promise.all([
      page.waitForLoadState('domcontentloaded').catch(() => {}),
      submit.click(),
    ]);
    await shot('apres-submit', 'Après clic sur Se connecter');

    // 5) Vérifier l'accès au tableau de bord
    // Stratégie: attendre soit un changement d'URL, soit un élément typique du dashboard.
    const dashboardSignals = [
      'text=Tableau de bord',
      'text=Dashboard',
      'nav',
      '[role="navigation"]',
      'text=e-MCF',
      'text=e-SFE',
    ];

    let dashboardOk = false;

    // a) URL change
    try {
      await page.waitForURL((u) => !String(u).includes('login'), { timeout: 10_000 });
      dashboardOk = true;
    } catch (_) {
      // ignore
    }

    // b) fallback selectors
    if (!dashboardOk) {
      for (const sig of dashboardSignals) {
        try {
          await page.locator(sig).first().waitFor({ state: 'visible', timeout: 5_000 });
          dashboardOk = true;
          break;
        } catch (_) {
          // ignore
        }
      }
    }

    await shot('dashboard', 'Écran post-connexion (dashboard attendu)', {
      dashboardOk,
      currentUrl: page.url(),
    });

    if (!dashboardOk) {
      throw new Error('Connexion incertaine: aucun signal clair de tableau de bord détecté. Vérifie identifiants / changements UI.');
    }

    finishRun(runData, 'PASS');
  } catch (err) {
    try {
      step += 1;
      const s = await takeScreenshot(page, {
        baseDir: screenshotsBaseDir,
        testId: TEST_ID,
        step,
        label: 'erreur',
        fullPage: true,
      });

      logStep(runData, {
        title: 'Erreur (capture automatique)',
        action: 'error',
        details: { message: err && err.message ? String(err.message) : String(err) },
        screenshots: [{ ...s, label: 'erreur' }],
      });
    } catch (_) {
      // ignore
    }

    finishRun(runData, 'FAIL', err);
    throw err;
  } finally {
    const out = saveTestReport({
      reportsDir,
      run: runData,
      screenshotsBaseRel: shotsBaseRel,
    });

    // eslint-disable-next-line no-console
    console.log(`Report JSON: ${out.jsonPath}`);
    // eslint-disable-next-line no-console
    console.log(`Report HTML: ${out.htmlPath}`);

    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('TEST FAILED:', err && err.message ? err.message : err);
  process.exitCode = 1;
});
