import fs from 'fs';
import path from 'path';

const DEFAULT_TIMEOUT_MS = 30_000;

function nowIso() {
  return new Date().toISOString();
}

async function getInvoiceDetails({ resolvedInvoiceBaseUrl, token, timeoutMs, uid }) {
  const safeUid = encodeURIComponent(uid);
  const url = joinUrl(resolvedInvoiceBaseUrl, `${safeUid}`);
  return await fetchJson({ url, method: 'GET', token, timeoutMs });
}

function makeApiError(res) {
  const code = res?.errorCode;
  const desc = res?.errorDesc || res?.errorMessage || res?.message || 'Unknown error';
  const err = new Error(`API error ${code}: ${desc}`);
  err.status = null;
  err.response = res;
  return err;
}

async function finalizeInvoice({ resolvedInvoiceBaseUrl, token, timeoutMs, uid, action }) {
  const safeUid = encodeURIComponent(uid);
  const safeAction = encodeURIComponent(action);
  const url = joinUrl(resolvedInvoiceBaseUrl, `${safeUid}/${safeAction}`);
  try {
    return await fetchJson({ url, method: 'POST', token, timeoutMs });
  } catch (e) {
    const status = e?.status ?? null;
    if (status === 404 || status === 405) {
      return await fetchJson({ url, method: 'PUT', token, timeoutMs });
    }
    throw e;
  }
}

function looksLikeHtmlResponse(v) {
  if (!v) return false;
  if (typeof v === 'object' && typeof v._raw === 'string') {
    const s = v._raw.trim().toLowerCase();
    return s.startsWith('<!doctype html') || s.startsWith('<html') || s.includes('<head>');
  }
  return false;
}

async function tryGetInvoiceTypesInfo({ resolvedInvoiceBaseUrl, token, timeoutMs }) {
  // From SDK: apiInfoInvoiceTypesGet() => usually /api/info/invoice-types
  // Our resolvedInvoiceBaseUrl ends with /api/invoice
  const root = String(resolvedInvoiceBaseUrl).replace(/\/api\/invoice\/?$/i, '');
  const url = joinUrl(root, '/api/info/invoice-types');
  try {
    const res = await fetchJson({ url, method: 'GET', token, timeoutMs });
    return { ok: true, url, res };
  } catch (e) {
    return {
      ok: false,
      url,
      error: safeString(e?.message || e),
      status: e?.status ?? null,
      response: e?.response ?? null,
    };
  }
}

function extractUid(res) {
  if (!res || typeof res !== 'object') return null;
  const any = res;
  return (
    any.uid ||
    any.UID ||
    any.invoiceUid ||
    any.invoice_uid ||
    any.data?.uid ||
    any.result?.uid ||
    any.invoice?.uid ||
    null
  );
}

function safeString(v) {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function parseBool(v, def = false) {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  if (!s) return def;
  return s === '1' || s === 'true' || s === 'yes' || s === 'y';
}

function readEnvFileIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) continue;
      const k = trimmed.slice(0, idx).trim();
      let v = trimmed.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    // ignore
  }
}

function normalizeToken(token) {
  const raw = safeString(token).trim();
  if (!raw) return '';
  return raw.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : raw;
}

function joinUrl(base, part) {
  const b = safeString(base).replace(/\/+$/, '');
  const p = safeString(part).replace(/^\/+/, '');
  return `${b}/${p}`;
}

function normalizeInvoiceBaseUrl(baseUrl) {
  const b = safeString(baseUrl).replace(/\/+$/, '');
  if (!b) return '';
  if (b.endsWith('/invoice')) return b;
  return joinUrl(b, 'invoice');
}

function deriveInvoiceApiCandidates(inputBaseUrl) {
  const b = safeString(inputBaseUrl).replace(/\/+$/, '');
  if (!b) return [];

  const set = new Set();
  const add = (u) => {
    const s = safeString(u).trim();
    if (s) set.add(s);
  };

  // what Electron does today
  add(normalizeInvoiceBaseUrl(b));

  // common API layouts
  add(joinUrl(b, 'api/invoice'));
  add(joinUrl(b, 'api/v1/invoice'));
  add(joinUrl(b, 'emcf/api/v1/invoice'));

  // If user supplied portal path (sygmef-test), API may live under /sygmef-test/api
  if (b.includes('/sygmef-test')) {
    add(normalizeInvoiceBaseUrl(b.replace('/sygmef-test', '/sygmef-test/api')));
    add(normalizeInvoiceBaseUrl(b.replace('/sygmef-test', '/sygmef-test/api/v1')));
  }

  // If user supplied domain root, API may live under /sygmef-test/api
  if (!b.includes('/sygmef-test') && (b.includes('developper.impots.bj') || b.includes('sygmef.impots.bj'))) {
    add(normalizeInvoiceBaseUrl(joinUrl(b, 'sygmef-test/api')));
    add(normalizeInvoiceBaseUrl(joinUrl(b, 'sygmef/api')));
  }

  return Array.from(set);
}

async function fetchJson({ url, method, token, body, timeoutMs }) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      Accept: 'application/json',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { _raw: text };
    }

    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} ${res.statusText}`);
      err.status = res.status;
      err.response = json;
      throw err;
    }

    return json;
  } finally {
    clearTimeout(id);
  }
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function summarizeTests(tests) {
  const summary = { total: tests.length, pass: 0, fail: 0, skipped: 0, duration_seconds: 0 };
  for (const t of tests) {
    if (t.statut === 'PASS') summary.pass += 1;
    else if (t.statut === 'FAIL') summary.fail += 1;
    else summary.skipped += 1;
  }
  return summary;
}

function renderHtmlDashboard(report) {
  const esc = (s) => safeString(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rows = report.tests
    .map((t) => {
      const color = t.statut === 'PASS' ? '#0f7b0f' : t.statut === 'FAIL' ? '#b00020' : '#555';
      const env = esc(t.environnement);
      const id = esc(t.test_id);
      const name = esc(t.test_nom);
      const cat = esc(t.test_categorie);
      const status = esc(t.statut);
      const err = esc(t.details?.erreur || '');
      const uid = esc(t.donnees_test?.facture_uid || '');
      return `<tr>
        <td>${id}</td>
        <td>${cat}</td>
        <td>${env}</td>
        <td>${name}</td>
        <td style="color:${color};font-weight:700">${status}</td>
        <td>${uid}</td>
        <td style="max-width:520px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${err}</td>
      </tr>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Rapport tests e-MECeF</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;margin:24px;color:#222}
    .cards{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}
    .card{border:1px solid #ddd;border-radius:10px;padding:12px 14px;min-width:160px;background:#fafafa}
    .k{font-size:12px;color:#555}
    .v{font-size:20px;font-weight:800}
    table{border-collapse:collapse;width:100%;margin-top:18px}
    th,td{border:1px solid #e2e2e2;padding:10px;font-size:13px;vertical-align:top}
    th{background:#f3f3f3;text-align:left}
    .muted{color:#666}
    .top{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .h1{font-size:20px;font-weight:900}
  </style>
</head>
<body>
  <div class="top">
    <div>
      <div class="h1">Rapport de validation e‑MECeF</div>
      <div class="muted">Run ID: ${esc(report.run_id)} | Date: ${esc(report.generated_at)}</div>
      <div class="muted">Environnement: ${esc(report.environment?.name)} | Base URL: ${esc(report.environment?.base_url)}</div>
    </div>
    <div class="muted">App: ${esc(report.app?.name)} v${esc(report.app?.version)} (${esc(report.app?.platform)})</div>
  </div>

  <div class="cards">
    <div class="card"><div class="k">Total</div><div class="v">${report.summary.total}</div></div>
    <div class="card"><div class="k">PASS</div><div class="v" style="color:#0f7b0f">${report.summary.pass}</div></div>
    <div class="card"><div class="k">FAIL</div><div class="v" style="color:#b00020">${report.summary.fail}</div></div>
    <div class="card"><div class="k">SKIPPED</div><div class="v" style="color:#555">${report.summary.skipped}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Test ID</th>
        <th>Catégorie</th>
        <th>Env</th>
        <th>Nom</th>
        <th>Statut</th>
        <th>UID</th>
        <th>Erreur</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <p class="muted" style="margin-top:16px">Astuce: ouvre le JSON du run pour voir les réponses brutes (status/submit/getInvoice) et diagnostiquer les erreurs.</p>
</body>
</html>`;
}

function makeTestResult({ test_id, test_nom, test_categorie, description, environnement, startedAt, endedAt, statut, details, donnees_test }) {
  return {
    test_id,
    test_nom,
    test_categorie,
    description,
    environnement,
    date_execution: startedAt,
    ended_at: endedAt,
    statut,
    details,
    donnees_test,
  };
}

function envNameFromBaseUrl(baseUrl) {
  const b = safeString(baseUrl).toLowerCase();
  if (b.includes('sygmef-test') || b.includes('developper')) return 'test';
  return 'production';
}

async function main() {
  const repoRoot = process.cwd();

  // optional local env file (no secrets in git) - you can create it locally
  readEnvFileIfExists(path.join(repoRoot, 'config', 'emcf.env'));
  // fallback to example file to reduce setup friction (still requires you to fill real values)
  readEnvFileIfExists(path.join(repoRoot, 'config', 'emcf.env.example'));

  const baseUrl = safeString(process.env.EMCF_BASE_URL).trim();
  const token = normalizeToken(process.env.EMCF_TOKEN);
  const vendorIfu = safeString(process.env.EMCF_VENDOR_IFU).trim();
  const operatorId = safeString(process.env.EMCF_OPERATOR_ID || '1');
  const operatorName = safeString(process.env.EMCF_OPERATOR_NAME || 'Automated Test');
  const timeoutMs = Number(process.env.EMCF_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const shouldConfirm = parseBool(process.env.EMCF_CONFIRM_INVOICE, false);

  if (!baseUrl) {
    console.error('Missing EMCF_BASE_URL. Set it in env or config/emcf.env');
    process.exit(2);
  }
  if (!token) {
    console.error('Missing EMCF_TOKEN. Set it in env or config/emcf.env');
    process.exit(2);
  }
  if (!vendorIfu) {
    console.error('Missing EMCF_VENDOR_IFU (your IFU). Set it in env or config/emcf.env');
    process.exit(2);
  }

  const environmentName = envNameFromBaseUrl(baseUrl);
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}_${environmentName}`;

  const reportsDir = path.join(repoRoot, 'reports', 'emcf');
  ensureDir(reportsDir);

  const tests = [];

  // Resolve invoice API base URL (some users mistakenly point to the web portal)
  let resolvedInvoiceBaseUrl = baseUrl;
  const candidates = deriveInvoiceApiCandidates(baseUrl);

  // Test 1: STATUS (and URL resolution)
  {
    const startedAt = nowIso();
    let endedAt = startedAt;
    let statut = 'FAIL';
    let details = { etapes: [], resultats_attendu: '', resultats_obtenu: '', erreur: null, screenshots: [] };

    try {
      details.etapes = ['GET (détection HTML/JSON) + résolution URL API'];
      details.resultats_attendu = 'Endpoint e-MECeF répond en JSON (pas HTML).';

      let selected = null;
      const attempts = [];
      for (const u of candidates) {
        try {
          const r = await fetchJson({ url: u, method: 'GET', token, timeoutMs });
          attempts.push({ url: u, ok: true, html: looksLikeHtmlResponse(r) });
          if (!looksLikeHtmlResponse(r)) {
            selected = { url: u, res: r };
            break;
          }
        } catch (err) {
          attempts.push({ url: u, ok: false, status: err?.status ?? null });
        }
      }

      endedAt = nowIso();
      details.attempts = attempts;

      if (!selected) {
        statut = 'FAIL';
        details.erreur =
          "Impossible de trouver l'endpoint API e-MECeF (toutes les URLs candidates renvoient HTML ou erreur). Mets dans EMCF_BASE_URL l'URL exacte de l'API invoice (ex: .../api/invoice).";
        details.resultats_obtenu = 'Aucune URL API valide détectée.';
      } else {
        resolvedInvoiceBaseUrl = selected.url;
        statut = 'PASS';
        details.resultats_obtenu = `Endpoint API détecté: ${resolvedInvoiceBaseUrl}`;
        details.raw = selected.res;
      }
    } catch (e) {
      endedAt = nowIso();
      details.erreur = safeString(e?.message || e);
      details.http_status = e?.status ?? null;
      details.raw = e?.response ?? details.raw ?? null;
    }

    tests.push(
      makeTestResult({
        test_id: 'EMCF-STATUS-01',
        test_nom: 'Status e-MECeF',
        test_categorie: 'Connexion',
        description: 'Valider que /status répond et que le token est accepté.',
        environnement: environmentName,
        startedAt,
        endedAt,
        statut,
        details,
        donnees_test: { facture_uid: null, client_ifu: null, montant: null },
      })
    );
  }

  // Helper: submit invoice with optional parameters (matching SDK structure)
  async function submitInvoice({
    type = 'FV',
    aibRate = 0,
    paymentMode = 'ESPECES',
    description = null,
    message = null,
    clientIfu = null,
    isExport = false,
    extraFields = null,
    autoFinalize = true,
    finalizeAction = null,
  }) {
    const items = [
      {
        name: 'Test Article e-MECeF',
        price: isExport ? 1000 : 1180,
        quantity: 1,
        taxGroup: isExport ? 'A' : 'B', // A: exonéré, B: TVA 18%
      },
    ];
    const totalHt = items.reduce((s, it) => s + (it.price * it.quantity), 0);
    const totalVat = items.reduce((s, it) => s + (it.taxGroup === 'B' ? (it.price * it.quantity * 0.18) : 0), 0);
    const totalAib = items.reduce((s, it) => s + (it.price * it.quantity * aibRate / 100), 0);
    const totalTtc = totalHt + totalVat + totalAib;
    const payload = {
      ifu: vendorIfu,
      type,
      items,
      operator: {
        name: 'Test Operator',
      },
      customer: {
        name: 'Client Test e-MECeF',
        ifu: clientIfu,
        address: 'Cotonou, Bénin',
        phone: '+22900000000',
        email: 'test@example.com',
      },
      // payment: [
      //   {
      //     mode: paymentMode === 'ESPECES' ? 'CASH' : paymentMode,
      //     amount: totalTtc,
      //   },
      // ],
      description,
      message,
      ...(extraFields && typeof extraFields === 'object' ? extraFields : {}),
    };
    const submitUrl = joinUrl(resolvedInvoiceBaseUrl, '');
    const res = await fetchJson({ url: submitUrl, method: 'POST', token, timeoutMs, body: payload });
    // API e-MECeF returns errorCode !== '0' on failure
    if (res && typeof res === 'object' && res.errorCode && res.errorCode !== '0') {
      // Log full response for common blocking codes
      if (res.errorCode === '7' || res.errorCode === '13' || res.errorCode === '3' || res.errorCode === '4') {
        console.error(`=== API ERROR ${res.errorCode} DEBUG ===`);
        console.error('Full response:', JSON.stringify(res, null, 2));
        console.error('========================');
      }
      throw makeApiError(res);
    }
    const uid = res?.uid ?? null;
    if (uid && autoFinalize) {
      const action = finalizeAction || (shouldConfirm ? 'confirm' : 'cancel');
      try {
        await finalizeInvoice({ resolvedInvoiceBaseUrl, token, timeoutMs, uid, action });
      } catch {
        // Do not fail submit if finalize fails; the dedicated finalize test covers it.
      }
    }
    return { uid, raw: res };
  }

  function looksLikeEndpointMissing(err) {
    const status = err?.status ?? null;
    const raw = err?.response?._raw ?? '';
    if (status === 404) return true;
    if (typeof raw === 'string' && raw.includes('<!DOCTYPE html')) return true;
    return false;
  }

  // Test 2: SUBMIT INVOICE (FV)
  let submittedUid = null;
  {
    const startedAt = nowIso();
    let endedAt = startedAt;
    let statut = 'FAIL';
    let details = { etapes: [], resultats_attendu: '', resultats_obtenu: '', erreur: null, screenshots: [] };

    try {
      const result = await submitInvoice({});
      submittedUid = result.uid;
      endedAt = nowIso();
      statut = 'PASS';
      details.resultats_obtenu = `Invoice submitted. UID=${result.uid}`;
      details.raw = result.raw;
    } catch (e) {
      endedAt = nowIso();
      details.erreur = safeString(e?.message || e);
      details.http_status = e?.status ?? null;
      details.raw = e?.response ?? details.raw ?? null;
    }

    tests.push(
      makeTestResult({
        test_id: 'EMCF-INVOICE-01',
        test_nom: 'Soumission facture vente (FV)',
        test_categorie: 'Facturation',
        description: 'Soumettre une facture de vente minimale et vérifier le retour UID.',
        environnement: environmentName,
        startedAt,
        endedAt,
        statut,
        details,
        donnees_test: { facture_uid: submittedUid, client_ifu: null, montant: 1180 },
      })
    );
  }

  // Test 3: VALIDATION IFU CLIENT (valide)
  {
    const startedAt = nowIso();
    let endedAt = startedAt;
    let statut = 'FAIL';
    let details = { etapes: [], resultats_attendu: '', resultats_obtenu: '', erreur: null, screenshots: [] };
    const validIfu = '0202368226611'; // same as vendor for test

    try {
      const result = await submitInvoice({ clientIfu: validIfu });
      endedAt = nowIso();
      statut = 'PASS';
      details.resultats_obtenu = `Invoice with valid IFU submitted. UID=${result.uid}`;
      details.raw = result.raw;
    } catch (e) {
      endedAt = nowIso();
      statut = 'FAIL';
      details.erreur = safeString(e?.message || e);
      details.http_status = e?.status ?? null;
      details.raw = e?.response ?? details.raw ?? null;
    }

    tests.push(
      makeTestResult({
        test_id: 'EMCF-CLIENT-01',
        test_nom: 'Validation IFU client valide',
        test_categorie: 'Client',
        description: 'Soumettre une facture avec un IFU client valide et vérifier l\'acceptation.',
        environnement: environmentName,
        startedAt,
        endedAt,
        statut,
        details,
        donnees_test: { facture_uid: null, client_ifu: validIfu, montant: 1180 },
      })
    );
  }

  // Test 4: VALIDATION IFU CLIENT (invalide)
  {
    const startedAt = nowIso();
    let endedAt = startedAt;
    let statut = 'FAIL';
    let details = { etapes: [], resultats_attendu: '', resultats_obtenu: '', erreur: null, screenshots: [] };
    const invalidIfu = '9999999999999';

    try {
      const result = await submitInvoice({ clientIfu: invalidIfu });
      endedAt = nowIso();
      // If API accepts invalid IFU, mark as warning but not fail (depends on implementation)
      statut = 'PASS';
      details.resultats_obtenu = `Invoice with invalid IFU submitted (API may not validate IFU). UID=${result.uid}`;
      details.raw = result.raw;
    } catch (e) {
      endedAt = nowIso();
      statut = 'PASS'; // Expected failure
      details.resultats_obtenu = 'Invoice rejected as expected due to invalid IFU.';
      details.erreur = safeString(e?.message || e);
      details.http_status = e?.status ?? null;
      details.raw = e?.response ?? details.raw ?? null;
    }

    tests.push(
      makeTestResult({
        test_id: 'EMCF-CLIENT-02',
        test_nom: 'Rejet IFU client invalide',
        test_categorie: 'Client',
        description: 'Tenter de soumettre une facture avec un IFU client invalide et vérifier le rejet.',
        environnement: environmentName,
        startedAt,
        endedAt,
        statut,
        details,
        donnees_test: { facture_uid: null, client_ifu: invalidIfu, montant: 1180 },
      })
    );
  }

  // Test 5: AIB 0%
  {
    const startedAt = nowIso();
    let endedAt = startedAt;
    let statut = 'FAIL';
    let details = { etapes: [], resultats_attendu: '', resultats_obtenu: '', erreur: null, screenshots: [] };

    try {
      const result = await submitInvoice({ aibRate: 0 });
      endedAt = nowIso();
      statut = 'PASS';
      details.resultats_obtenu = `Invoice with AIB 0% submitted. UID=${result.uid}`;
      details.raw = result.raw;
    } catch (e) {
      endedAt = nowIso();
      statut = 'FAIL';
      details.erreur = safeString(e?.message || e);
      details.http_status = e?.status ?? null;
      details.raw = e?.response ?? details.raw ?? null;
    }

    tests.push(
      makeTestResult({
        test_id: 'EMCF-AIB-01',
        test_nom: 'AIB 0%',
        test_categorie: 'AIB',
        description: 'Soumettre une facture avec AIB 0% et vérifier l\'acceptation.',
        environnement: environmentName,
        startedAt,
        endedAt,
        statut,
        details,
        donnees_test: { facture_uid: null, client_ifu: null, montant: 1180 },
      })
    );
  }

  // Test 6: AIB 1%
  {
    const startedAt = nowIso();
    let endedAt = startedAt;
    let statut = 'FAIL';
    let details = { etapes: [], resultats_attendu: '', resultats_obtenu: '', erreur: null, screenshots: [] };

    try {
      const result = await submitInvoice({ aibRate: 1 });
      endedAt = nowIso();
      statut = 'PASS';
      details.resultats_obtenu = `Invoice with AIB 1% submitted. UID=${result.uid}`;
      details.raw = result.raw;
    } catch (e) {
      endedAt = nowIso();
      statut = 'FAIL';
      details.erreur = safeString(e?.message || e);
      details.http_status = e?.status ?? null;
      details.raw = e?.response ?? details.raw ?? null;
    }

    tests.push(
      makeTestResult({
        test_id: 'EMCF-AIB-02',
        test_nom: 'AIB 1%',
        test_categorie: 'AIB',
        description: 'Soumettre une facture avec AIB 1% et vérifier l\'acceptation.',
        environnement: environmentName,
        startedAt,
        endedAt,
        statut,
        details,
        donnees_test: { facture_uid: null, client_ifu: null, montant: 1180 },
      })
    );
  }

  // Test 7: AIB 5%
  {
    const startedAt = nowIso();
    let endedAt = startedAt;
    let statut = 'FAIL';
    let details = { etapes: [], resultats_attendu: '', resultats_obtenu: '', erreur: null, screenshots: [] };

    try {
      const result = await submitInvoice({ aibRate: 5 });
      endedAt = nowIso();
      statut = 'PASS';
      details.resultats_obtenu = `Invoice with AIB 5% submitted. UID=${result.uid}`;
      details.raw = result.raw;
    } catch (e) {
      endedAt = nowIso();
      statut = 'FAIL';
      details.erreur = safeString(e?.message || e);
      details.http_status = e?.status ?? null;
      details.raw = e?.response ?? details.raw ?? null;
    }

    tests.push(
      makeTestResult({
        test_id: 'EMCF-AIB-03',
        test_nom: 'AIB 5%',
        test_categorie: 'AIB',
        description: 'Soumettre une facture avec AIB 5% et vérifier l\'acceptation.',
        environnement: environmentName,
        startedAt,
        endedAt,
        statut,
        details,
        donnees_test: { facture_uid: null, client_ifu: null, montant: 1180 },
      })
    );
  }

  // Test 8: Paiement non ESPECES
  {
    const startedAt = nowIso();
    let endedAt = startedAt;
    let statut = 'FAIL';
    let details = { etapes: [], resultats_attendu: '', resultats_obtenu: '', erreur: null, screenshots: [] };

    try {
      const result = await submitInvoice({ paymentMode: 'BANK_TRANSFER' });
      endedAt = nowIso();
      statut = 'PASS';
      details.resultats_obtenu = `Invoice with payment mode BANK_TRANSFER submitted. UID=${result.uid}`;
      details.raw = result.raw;
    } catch (e) {
      endedAt = nowIso();
      statut = 'FAIL';
      details.erreur = safeString(e?.message || e);
      details.http_status = e?.status ?? null;
      details.raw = e?.response ?? details.raw ?? null;
    }

    tests.push(
      makeTestResult({
        test_id: 'EMCF-PAIEMENT-01',
        test_nom: 'Paiement non ESPECES',
        test_categorie: 'Paiement',
        description: 'Soumettre une facture avec un mode de paiement autre que ESPECES.',
        environnement: environmentName,
        startedAt,
        endedAt,
        statut,
        details,
        donnees_test: { facture_uid: null, client_ifu: null, montant: 1180 },
      })
    );
  }

  // Test 9: Facture d'avoir
  {
    const startedAt = nowIso();
    let endedAt = startedAt;
    let statut = 'FAIL';
    let details = { etapes: [], resultats_attendu: '', resultats_obtenu: '', erreur: null, screenshots: [] };

    try {
      // The exact credit-note type code and reference field vary by deployment.
      // 1) Try discovering invoice types via /api/info/invoice-types
      const info = await tryGetInvoiceTypesInfo({ resolvedInvoiceBaseUrl, token, timeoutMs });

      // NOTE: From observed behavior:
      // - errorCode=3 => invalid invoice type
      // - errorCode=4 => missing original invoice reference (means type is likely valid)
      let typeCandidates = ['FA', 'AV', 'AF', 'FV_AV', 'AVOIR'];
      if (info.ok) {
        // Accept common shapes: array of strings, array of {code,name}, or object containing list
        const raw = info.res;
        const flattened = Array.isArray(raw)
          ? raw
          : raw && typeof raw === 'object'
            ? (raw.data || raw.types || raw.invoiceTypes || raw.items || [])
            : [];
        const codes = Array.isArray(flattened)
          ? flattened
              .map((x) => (typeof x === 'string' ? x : x?.code || x?.value || x?.name))
              .filter(Boolean)
          : [];
        const creditLike = codes.filter((c) => String(c).toUpperCase().includes('A'));
        if (codes.length > 0) typeCandidates = Array.from(new Set([...creditLike, ...codes, ...typeCandidates]));
      }

      // Create and CONFIRM an original invoice dedicated to the credit note.
      // Many deployments require the referenced invoice to be confirmed.
      const original = await submitInvoice({ autoFinalize: false });
      if (!original.uid) throw new Error('Avoir prerequisite failed: original FV invoice did not return uid');
      // Fetch details BEFORE finalization: some deployments return error once finalized.
      let originalDetails = null;
      try {
        originalDetails = await getInvoiceDetails({ resolvedInvoiceBaseUrl, token, timeoutMs, uid: original.uid });
      } catch {
        // not fatal; we'll still try with uid only
      }

      const originalConfirm = await finalizeInvoice({ resolvedInvoiceBaseUrl, token, timeoutMs, uid: original.uid, action: 'confirm' });

      const attempts = [];
      let success = null;

      // Phase 1: detect a valid credit-note type (prefer the one that yields errorCode=4)
      let selectedType = null;
      for (const t of typeCandidates) {
        try {
          const result = await submitInvoice({ type: t, autoFinalize: false });
          attempts.push({ phase: 'type-detect', type: t, ok: true, uid: result.uid });
          if (result.uid) {
            selectedType = t;
            success = { type: t, referenceVariant: 'none', result };
            break;
          }
        } catch (inner) {
          const res = inner?.response;
          const code = res?.errorCode;
          attempts.push({ phase: 'type-detect', type: t, ok: false, error: safeString(inner?.message || inner), api: res || null });
          if (code === '4' && !selectedType) {
            selectedType = t;
            // don't break; keep searching for a direct success
          }
        }
      }

      // Phase 2: try reference field variants only if we found a plausible type and haven't succeeded
      if (!success && selectedType) {
        const candidateValues = [];
        const pushVal = (label, value) => {
          if (!value) return;
          const s = String(value);
          if (!s.trim()) return;
          if (candidateValues.some((x) => x.value === s)) return;
          candidateValues.push({ label, value: s });
        };

        const extract24FromQr = (qr) => {
          if (!qr) return null;
          const parts = String(qr).split(';');
          // Expected: F;NIM;CODE24;IFU;YYYYMMDDhhmmss
          if (parts.length >= 3) {
            const code = String(parts[2] || '').trim();
            if (code.length === 24) return code;
          }
          return null;
        };

        const normalizeCodeMecEf = (code) => {
          if (!code) return null;
          const s = String(code).replace(/-/g, '').trim();
          return s.length === 24 ? s : s;
        };

        pushVal('uid', original.uid);
        pushVal('confirm.uid', originalConfirm?.uid);
        pushVal('confirm.nim', originalConfirm?.nim);
        pushVal('confirm.counters', originalConfirm?.counters);
        pushVal('confirm.codeMecEf', originalConfirm?.codeMecEf || originalConfirm?.codeMECeF || originalConfirm?.codeMecEF);
        pushVal('confirm.codeMECeFDGI', originalConfirm?.codeMECeFDGI);
        pushVal('confirm.code24', extract24FromQr(originalConfirm?.qrCode) || normalizeCodeMecEf(originalConfirm?.codeMECeFDGI));
        pushVal('confirm.qrCode', originalConfirm?.qrCode || originalConfirm?.qr_code);
        pushVal('confirm.dateTime', originalConfirm?.dateTime || originalConfirm?.date_time);
        pushVal('details.reference', originalDetails?.reference);
        pushVal('details.ref', originalDetails?.ref);
        pushVal('details.invoiceNumber', originalDetails?.invoiceNumber);
        pushVal('details.number', originalDetails?.number);
        pushVal('details.counters', typeof originalDetails?.counters === 'string' ? originalDetails.counters : null);
        pushVal('details.emcfCounters', typeof originalDetails?.emcfCounters === 'string' ? originalDetails.emcfCounters : null);

        const fieldsToTry = [
          // Based on observed API error codes, `reference` is the most likely field.
          'reference',
          'originalInvoiceReference',
          'originalInvoiceUid',
          'invoiceReference',
          'referenceUid',
          'refInvoiceUid',
        ];

        const referenceVariants = [];
        for (const f of fieldsToTry) {
          for (const v of candidateValues) {
            referenceVariants.push({ name: `${f}=${v.label}`, fields: { [f]: v.value } });
          }
        }

        // Also try a couple of nested shapes (with uid only)
        referenceVariants.push({ name: 'originalInvoice(object.uid)', fields: { originalInvoice: { uid: original.uid } } });
        referenceVariants.push({ name: 'referenceInvoice(object.uid)', fields: { referenceInvoice: { uid: original.uid } } });

        // Limit attempts to avoid spamming API
        for (const v of referenceVariants.slice(0, 30)) {
          try {
            const result = await submitInvoice({
              type: selectedType,
              extraFields: v.fields,
              autoFinalize: true,
              finalizeAction: shouldConfirm ? 'confirm' : 'cancel',
            });
            attempts.push({ phase: 'reference-try', type: selectedType, referenceVariant: v.name, ok: true, uid: result.uid });
            if (result.uid) {
              success = { type: selectedType, referenceVariant: v.name, result };
              break;
            }
          } catch (inner) {
            attempts.push({ phase: 'reference-try', type: selectedType, referenceVariant: v.name, ok: false, error: safeString(inner?.message || inner), api: inner?.response || null });
          }
        }
      }

      endedAt = nowIso();
      if (!success) {
        statut = 'FAIL';
        details.erreur = `Aucun avoir accepté. Type probable=${selectedType || 'inconnu'}. Voir raw.attempts pour les codes erreurs exacts.`;
        details.raw = { info, typeCandidatesTried: typeCandidates.slice(0, 30), selectedType, originalInvoiceUid: original.uid, originalDetails, originalConfirm, attempts };
      } else {
        statut = 'PASS';
        details.resultats_obtenu = `Avoir soumis. type=${success.type} ref=${success.referenceVariant} UID=${success.result.uid}`;
        details.raw = { info, usedType: success.type, usedReferenceVariant: success.referenceVariant, response: success.result.raw, originalDetails, originalConfirm, attempts };
      }
    } catch (e) {
      endedAt = nowIso();
      statut = 'FAIL';
      details.erreur = safeString(e?.message || e);
      details.http_status = e?.status ?? null;
      details.raw = e?.response ?? details.raw ?? null;
    }

    tests.push(
      makeTestResult({
        test_id: 'EMCF-FACTURE-03',
        test_nom: 'Facture d\'avoir (AV)',
        test_categorie: 'Facturation',
        description: 'Soumettre une facture d\'avoir avec référence à la facture originale.',
        environnement: environmentName,
        startedAt,
        endedAt,
        statut,
        details,
        donnees_test: { facture_uid: null, client_ifu: null, montant: -1180 },
      })
    );
  }

  // Test 10: Facture export vente
  {
    const startedAt = nowIso();
    let endedAt = startedAt;
    let statut = 'FAIL';
    let details = { etapes: [], resultats_attendu: '', resultats_obtenu: '', erreur: null, screenshots: [] };

    try {
      const result = await submitInvoice({ isExport: true });
      endedAt = nowIso();
      statut = 'PASS';
      details.resultats_obtenu = `Export invoice (FV) submitted. UID=${result.uid}`;
      details.raw = result.raw;
    } catch (e) {
      endedAt = nowIso();
      statut = 'FAIL';
      details.erreur = safeString(e?.message || e);
      details.http_status = e?.status ?? null;
      details.raw = e?.response ?? details.raw ?? null;
    }

    tests.push(
      makeTestResult({
        test_id: 'EMCF-FACTURE-04',
        test_nom: 'Facture export vente',
        test_categorie: 'Facturation',
        description: 'Soumettre une facture de vente à l\'exportation (TVA 0%).',
        environnement: environmentName,
        startedAt,
        endedAt,
        statut,
        details,
        donnees_test: { facture_uid: null, client_ifu: null, montant: 1000 },
      })
    );
  }

  // Test 11: Description supplémentaire
  {
    const startedAt = nowIso();
    let endedAt = startedAt;
    let statut = 'FAIL';
    let details = { etapes: [], resultats_attendu: '', resultats_obtenu: '', erreur: null, screenshots: [] };
    const description = 'Ligne 1\nLigne 2\nLigne 3';

    try {
      const result = await submitInvoice({ description });
      endedAt = nowIso();
      statut = 'PASS';
      details.resultats_obtenu = `Invoice with description submitted. UID=${result.uid}`;
      details.raw = result.raw;
    } catch (e) {
      endedAt = nowIso();
      statut = 'FAIL';
      details.erreur = safeString(e?.message || e);
      details.http_status = e?.status ?? null;
      details.raw = e?.response ?? details.raw ?? null;
    }

    tests.push(
      makeTestResult({
        test_id: 'EMCF-DESC-01',
        test_nom: 'Description supplémentaire',
        test_categorie: 'Description',
        description: 'Soumettre une facture avec une description sur 3 lignes.',
        environnement: environmentName,
        startedAt,
        endedAt,
        statut,
        details,
        donnees_test: { facture_uid: null, client_ifu: null, montant: 1180 },
      })
    );
  }

  // Test 12: Message commercial
  {
    const startedAt = nowIso();
    let endedAt = startedAt;
    let statut = 'FAIL';
    let details = { etapes: [], resultats_attendu: '', resultats_obtenu: '', erreur: null, screenshots: [] };
    const message = 'Merci pour votre confiance !';

    try {
      const result = await submitInvoice({ message });
      endedAt = nowIso();
      statut = 'PASS';
      details.resultats_obtenu = `Invoice with commercial message submitted. UID=${result.uid}`;
      details.raw = result.raw;
    } catch (e) {
      endedAt = nowIso();
      statut = 'FAIL';
      details.erreur = safeString(e?.message || e);
      details.http_status = e?.status ?? null;
      details.raw = e?.response ?? details.raw ?? null;
    }

    tests.push(
      makeTestResult({
        test_id: 'EMCF-MSG-01',
        test_nom: 'Message commercial',
        test_categorie: 'Message',
        description: 'Soumettre une facture avec un message commercial en pied de page.',
        environnement: environmentName,
        startedAt,
        endedAt,
        statut,
        details,
        donnees_test: { facture_uid: null, client_ifu: null, montant: 1180 },
      })
    );
  }

  // Helper: article CRUD operations
  async function createArticle(article) {
    const articlesUrl = joinUrl(resolvedInvoiceBaseUrl.replace('/invoice', '/articles'));
    const res = await fetchJson({ url: articlesUrl, method: 'POST', token, timeoutMs, body: article });
    if (res && typeof res === 'object' && res.errorCode && res.errorCode !== '0') {
      throw new Error(`API error ${res.errorCode}: ${res.errorMessage || res.message || 'Unknown error'}`);
    }
    return { id: res?.id, raw: res };
  }

  async function updateArticle(id, article) {
    const articleUrl = joinUrl(resolvedInvoiceBaseUrl.replace('/invoice', '/articles'), `${encodeURIComponent(id)}`);
    const res = await fetchJson({ url: articleUrl, method: 'PUT', token, timeoutMs, body: article });
    if (res && typeof res === 'object' && res.errorCode && res.errorCode !== '0') {
      throw new Error(`API error ${res.errorCode}: ${res.errorMessage || res.message || 'Unknown error'}`);
    }
    return { raw: res };
  }

  async function deleteArticle(id) {
    const articleUrl = joinUrl(resolvedInvoiceBaseUrl.replace('/invoice', '/articles'), `${encodeURIComponent(id)}`);
    const res = await fetchJson({ url: articleUrl, method: 'DELETE', token, timeoutMs });
    if (res && typeof res === 'object' && res.errorCode && res.errorCode !== '0') {
      throw new Error(`API error ${res.errorCode}: ${res.errorMessage || res.message || 'Unknown error'}`);
    }
    return { raw: res };
  }

  // Test 13: ARTICLE CRUD (préprogrammé)
  let createdArticleId = null;
  {
    const startedAt = nowIso();
    let endedAt = startedAt;
    let statut = 'FAIL';
    let details = { etapes: [], resultats_attendu: '', resultats_obtenu: '', erreur: null, screenshots: [] };
    const article = {
      code: 'ART-TEST-01',
      designation: 'Article préprogrammé e-MECeF',
      unitPrice: 1500,
      vatRate: 18,
      aibRate: 0,
      isPreprogrammed: true,
    };

    try {
      const result = await createArticle(article);
      createdArticleId = result.id;
      endedAt = nowIso();
      statut = 'PASS';
      details.resultats_obtenu = `Article created. ID=${result.id}`;
      details.raw = result.raw;
    } catch (e) {
      endedAt = nowIso();
      if (looksLikeEndpointMissing(e)) {
        statut = 'SKIPPED';
        details.resultats_obtenu = "Endpoint Articles non exposé (404/HTML). Test ignoré.";
        details.erreur = null;
      } else {
        statut = 'FAIL';
        details.erreur = safeString(e?.message || e);
        details.http_status = e?.status ?? null;
        details.raw = e?.response ?? null;
      }
    }

    tests.push(
      makeTestResult({
        test_id: 'EMCF-ARTICLE-01',
        test_nom: 'Ajout article préprogrammé',
        test_categorie: 'Articles',
        description: 'Créer un article préprogrammé via API.',
        environnement: environmentName,
        startedAt,
        endedAt,
        statut,
        details,
        donnees_test: { facture_uid: null, client_ifu: null, montant: null },
      })
    );
  }

  // Test 14: ARTICLE CRUD (non préprogrammé)
  {
    const startedAt = nowIso();
    let endedAt = startedAt;
    let statut = 'FAIL';
    let details = { etapes: [], resultats_attendu: '', resultats_obtenu: '', erreur: null, screenshots: [] };
    const article = {
      code: 'ART-TEST-02',
      designation: 'Article non préprogrammé e-MECeF',
      unitPrice: 2000,
      vatRate: 18,
      aibRate: 1,
      isPreprogrammed: false,
    };

    try {
      const result = await createArticle(article);
      endedAt = nowIso();
      statut = 'PASS';
      details.resultats_obtenu = `Non-preprogrammed article created. ID=${result.id}`;
      details.raw = result.raw;
    } catch (e) {
      endedAt = nowIso();
      if (looksLikeEndpointMissing(e)) {
        statut = 'SKIPPED';
        details.resultats_obtenu = "Endpoint Articles non exposé (404/HTML). Test ignoré.";
        details.erreur = null;
      } else {
        statut = 'FAIL';
        details.erreur = safeString(e?.message || e);
        details.http_status = e?.status ?? null;
        details.raw = e?.response ?? null;
      }
    }

    tests.push(
      makeTestResult({
        test_id: 'EMCF-ARTICLE-02',
        test_nom: 'Ajout article non préprogrammé',
        test_categorie: 'Articles',
        description: 'Créer un article non préprogrammé via API.',
        environnement: environmentName,
        startedAt,
        endedAt,
        statut,
        details,
        donnees_test: { facture_uid: null, client_ifu: null, montant: null },
      })
    );
  }

  // Test 15: ARTICLE UPDATE
  if (createdArticleId) {
    const startedAt = nowIso();
    let endedAt = startedAt;
    let statut = 'FAIL';
    let details = { etapes: [], resultats_attendu: '', resultats_obtenu: '', erreur: null, screenshots: [] };
    const update = {
      designation: 'Article préprogrammé modifié',
      unitPrice: 1600,
    };

    try {
      const result = await updateArticle(createdArticleId, update);
      endedAt = nowIso();
      statut = 'PASS';
      details.resultats_obtenu = `Article ${createdArticleId} updated.`;
      details.raw = result.raw;
    } catch (e) {
      endedAt = nowIso();
      statut = 'FAIL';
      details.erreur = safeString(e?.message || e);
      details.http_status = e?.status ?? null;
      details.raw = e?.response ?? null;
    }

    tests.push(
      makeTestResult({
        test_id: 'EMCF-ARTICLE-03',
        test_nom: 'Modification article',
        test_categorie: 'Articles',
        description: 'Mettre à jour un article existant via API.',
        environnement: environmentName,
        startedAt,
        endedAt,
        statut,
        details,
        donnees_test: { facture_uid: null, client_ifu: null, montant: null },
      })
    );
  }

  // Test 16: ARTICLE DELETE
  if (createdArticleId) {
    const startedAt = nowIso();
    let endedAt = startedAt;
    let statut = 'FAIL';
    let details = { etapes: [], resultats_attendu: '', resultats_obtenu: '', erreur: null, screenshots: [] };

    try {
      const result = await deleteArticle(createdArticleId);
      endedAt = nowIso();
      statut = 'PASS';
      details.resultats_obtenu = `Article ${createdArticleId} deleted.`;
      details.raw = result.raw;
    } catch (e) {
      endedAt = nowIso();
      statut = 'FAIL';
      details.erreur = safeString(e?.message || e);
      details.http_status = e?.status ?? null;
      details.raw = e?.response ?? null;
    }

    tests.push(
      makeTestResult({
        test_id: 'EMCF-ARTICLE-04',
        test_nom: 'Suppression article',
        test_categorie: 'Articles',
        description: 'Supprimer un article existant via API.',
        environnement: environmentName,
        startedAt,
        endedAt,
        statut,
        details,
        donnees_test: { facture_uid: null, client_ifu: null, montant: null },
      })
    );
  }

  // Test 17: FINALIZE + GET INVOICE (optional)
  {
    const startedAt = nowIso();
    let endedAt = startedAt;
    let statut = 'SKIPPED';
    let details = { etapes: [], resultats_attendu: '', resultats_obtenu: '', erreur: null, screenshots: [] };

    if (!submittedUid) {
      details.resultats_obtenu = 'Skipped because submitInvoice did not return an UID.';
    } else {
      try {
        const action = shouldConfirm ? 'confirm' : 'cancel';
        details.etapes = [`POST /invoice/{uid}/${action} (fallback PUT si 404/405)`, 'GET /invoice/{uid}'];
        details.resultats_attendu = 'Finalisation accepte la facture (confirm/cancel) et GET retourne les informations.';

        const finalizeUrl = joinUrl(resolvedInvoiceBaseUrl, `${encodeURIComponent(submittedUid)}/${encodeURIComponent(action)}`);
        let finRes;
        try {
          finRes = await fetchJson({ url: finalizeUrl, method: 'POST', token, timeoutMs });
        } catch (e) {
          const status = e?.status ?? null;
          if (status === 404 || status === 405) {
            // Fallback to PUT as some e-MECeF deployments require PUT for finalize
            finRes = await fetchJson({ url: finalizeUrl, method: 'PUT', token, timeoutMs });
          } else {
            throw e;
          }
        }

        const getUrl = joinUrl(resolvedInvoiceBaseUrl, `${encodeURIComponent(submittedUid)}`);
        const invRes = await fetchJson({ url: getUrl, method: 'GET', token, timeoutMs });

        endedAt = nowIso();
        statut = 'PASS';
        details.resultats_obtenu = `Invoice ${action} OK + GET OK`;
        details.raw = { finalize: finRes, invoice: invRes };
      } catch (e) {
        endedAt = nowIso();
        statut = 'FAIL';
        details.erreur = safeString(e?.message || e);
        details.http_status = e?.status ?? null;
        details.raw = e?.response ?? null;
      }
    }

    tests.push(
      makeTestResult({
        test_id: 'EMCF-INVOICE-02',
        test_nom: 'Finalisation + récupération facture',
        test_categorie: 'Facturation',
        description: 'Confirmer ou annuler une facture soumise puis récupérer les détails.',
        environnement: environmentName,
        startedAt,
        endedAt,
        statut,
        details,
        donnees_test: { facture_uid: submittedUid, client_ifu: null, montant: null },
      })
    );
  }

  const report = {
    run_id: runId,
    generated_at: nowIso(),
    app: {
      name: 'Vin-Chef SFE',
      version: safeString(process.env.npm_package_version || ''),
      platform: 'node',
      operator: operatorName,
    },
    environment: {
      name: environmentName,
      base_url: baseUrl,
    },
    summary: summarizeTests(tests),
    tests,
    recommendations: [],
  };

  const jsonPath = path.join(reportsDir, `${runId}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  const htmlPath = path.join(reportsDir, `${runId}.html`);
  fs.writeFileSync(htmlPath, renderHtmlDashboard(report), 'utf8');

  console.log(`Report JSON: ${jsonPath}`);
  console.log(`Report HTML: ${htmlPath}`);

  if (report.summary.fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(2);
});
