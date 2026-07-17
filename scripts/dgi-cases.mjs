// Campagne d'auto-déclaration DGI e-MECeF : soumet et CONFIRME les 20 cas de test
// de l'annexe 2 sur la plateforme TEST, puis sauvegarde toutes les réponses
// (UID, code MECeF, QR, compteurs, montants API) dans reports/dgi-cases/results.json.
//
// Usage : node scripts/dgi-cases.mjs [--only 1,2,3]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// --- config (config/emcf.env) ---
const readEnvFileIfExists = (p) => {
  try {
    if (!fs.existsSync(p)) return;
    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, v] = m;
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    // ignore
  }
};
readEnvFileIfExists(path.join(repoRoot, 'config', 'emcf.env'));

const BASE_URL = String(process.env.EMCF_BASE_URL || '').replace(/\/+$/, '');
const TOKEN = String(process.env.EMCF_TOKEN || '').replace(/^bearer\s+/i, '').trim();
const VENDOR_IFU = String(process.env.EMCF_VENDOR_IFU || '').trim();
const TIMEOUT_MS = Number(process.env.EMCF_TIMEOUT_MS || 30000);

if (!BASE_URL || !TOKEN || !VENDOR_IFU) {
  console.error('Config manquante: EMCF_BASE_URL / EMCF_TOKEN / EMCF_VENDOR_IFU (config/emcf.env)');
  process.exit(1);
}

const API = `${BASE_URL}/api/invoice`;

const fetchJson = async ({ url, method, body }) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { _raw: text }; }
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(t);
  }
};

// --- Articles types (boutique vins & services) ---
const ART = {
  EXO: { name: 'Eau minérale Possotomè 1,5L', price: 1000, taxGroup: 'A' },
  TAX: { name: 'Vin rouge Bordeaux 75cl', price: 2000, taxGroup: 'B' },
  EXP: { name: 'Vin blanc Sancerre 75cl (export)', price: 5000, taxGroup: 'C' },
  MP: { name: 'Vin mousseux Asti (régime exception)', price: 2500, taxGroup: 'D' },
  TPS: { name: 'Prestation service bureautique', price: 1500, taxGroup: 'E' },
};

const item = (a, quantity, extra = {}) => ({ name: a.name, price: a.price, quantity, taxGroup: a.taxGroup, ...extra });

const CLIENT_ANON = { name: 'Client Divers', address: 'Cotonou, Bénin', contact: '+22900000000' };
const CLIENT_IFU = {
  name: 'Hôtel Royal Palace SARL',
  ifu: VENDOR_IFU, // IFU valide accepté sur la plateforme TEST
  address: 'Porto-Novo, Bénin',
  contact: '+22997000002',
};

// --- Définition des 20 cas (annexe 2 + remarques DGI) ---
// Remarques intégrées: test 1 sans taxe spécifique et PU != 0 ; tests 16/18/19/20 un seul article qté 2.
const CASES = [
  { id: 1, label: 'FV exonéré', type: 'FV', client: CLIENT_ANON, items: [item(ART.EXO, 1)] },
  { id: 2, label: 'FV taxable', type: 'FV', client: CLIENT_ANON, items: [item(ART.TAX, 1)] },
  { id: 3, label: 'FV taxable+exonéré', type: 'FV', client: CLIENT_ANON, items: [item(ART.EXO, 2), item(ART.TAX, 3)] },
  { id: 4, label: 'FV quantités décimales', type: 'FV', client: CLIENT_ANON, items: [item(ART.EXO, 2.5), item(ART.TAX, 3.25)] },
  { id: 5, label: 'FV avec IFU+nom client', type: 'FV', client: CLIENT_IFU, items: [item(ART.EXO, 2), item(ART.TAX, 3)] },
  { id: 6, label: 'FA remboursement (réf. test 5)', type: 'FA', client: CLIENT_IFU, items: [item(ART.EXO, 2), item(ART.TAX, 3)], refCase: 5 },
  { id: 7, label: 'FV taxable + taxe spécifique', type: 'FV', client: CLIENT_IFU, items: [item(ART.TAX, 3, { taxSpecific: 500 })] },
  { id: 8, label: 'FV AIB 5%', type: 'FV', client: CLIENT_ANON, items: [item(ART.EXO, 2), item(ART.TAX, 3)], aib: 'B' },
  { id: 9, label: 'FV AIB 1% + IFU client', type: 'FV', client: CLIENT_IFU, items: [item(ART.EXO, 2), item(ART.TAX, 3)], aib: 'A' },
  { id: 10, label: 'FV AIB 5% + IFU + taxe spécifique', type: 'FV', client: CLIENT_IFU, items: [item(ART.EXO, 2), item(ART.TAX, 3, { taxSpecific: 500 })], aib: 'B' },
  { id: 11, label: 'FV IFU client + taxe de séjour', type: 'FV', client: CLIENT_IFU, items: [item(ART.TAX, 2, { taxSpecific: 1000 })], sejour: true },
  { id: 12, label: 'FV régime exception', type: 'FV', client: CLIENT_ANON, items: [item(ART.MP, 2)] },
  { id: 13, label: 'FV régime exception + taxe spécifique', type: 'FV', client: CLIENT_ANON, items: [item(ART.MP, 2, { taxSpecific: 500 })] },
  { id: 14, label: 'FV régime TPS', type: 'FV', client: CLIENT_ANON, items: [item(ART.TPS, 2)] },
  { id: 15, label: 'FV régime TPS + taxe spécifique', type: 'FV', client: CLIENT_ANON, items: [item(ART.TPS, 2, { taxSpecific: 500 })] },
  { id: 16, label: 'EV export produits taxables', type: 'EV', client: CLIENT_ANON, items: [item(ART.EXP, 2)] },
  { id: 17, label: 'EV export (exonéré+taxable)', type: 'EV', client: CLIENT_ANON, items: [item(ART.EXO, 2), item(ART.EXP, 3)] },
  { id: 18, label: 'EA avoir export (réf. test 16)', type: 'EA', client: CLIENT_ANON, items: [item(ART.EXP, 2)], refCase: 16 },
  { id: 19, label: 'EV export régime TPS', type: 'EV', client: CLIENT_ANON, items: [item(ART.TPS, 2)] },
  { id: 20, label: 'EA avoir export TPS (réf. test 19)', type: 'EA', client: CLIENT_ANON, items: [item(ART.TPS, 2)], refCase: 19 },
];

const code24 = (confirmRes) => {
  const c = String(confirmRes?.codeMECeFDGI || '').replace(/-/g, '').trim();
  if (c.length === 24) return c;
  const parts = String(confirmRes?.qrCode || '').split(';');
  if (parts.length >= 3 && String(parts[2]).trim().length === 24) return String(parts[2]).trim();
  return null;
};

const main = async () => {
  const onlyArg = process.argv.indexOf('--only');
  const only = onlyArg >= 0 ? new Set(String(process.argv[onlyArg + 1] || '').split(',').map((s) => Number(s.trim()))) : null;

  const outDir = path.join(repoRoot, 'reports', 'dgi-cases');
  fs.mkdirSync(outDir, { recursive: true });
  const resultsPath = path.join(outDir, 'results.json');
  const previous = fs.existsSync(resultsPath) ? JSON.parse(fs.readFileSync(resultsPath, 'utf8')) : { cases: {} };
  const results = { generatedAt: new Date().toISOString(), baseUrl: BASE_URL, vendorIfu: VENDOR_IFU, cases: previous.cases || {} };

  // status (NIM etc.)
  const status = await fetchJson({ url: API, method: 'GET' });
  results.status = status;
  console.log(`[status] NIM=${status?.nim} IFU=${status?.ifu} tokenValid=${status?.tokenValid}`);

  for (const c of CASES) {
    if (only && !only.has(c.id)) continue;
    const tag = `[test ${String(c.id).padStart(2, '0')}]`;
    try {
      const payload = {
        ifu: VENDOR_IFU,
        type: c.type,
        items: c.items,
        client: c.client,
        customer: c.client,
        operator: { id: '1', name: 'admin' },
        ...(c.aib ? { aib: c.aib } : {}),
      };

      if (c.refCase) {
        const orig = results.cases[c.refCase];
        const ref = orig ? code24(orig.confirm) : null;
        if (!ref) throw new Error(`Référence introuvable: le test ${c.refCase} doit être confirmé d'abord`);
        // Spec DGI: seul le champ `reference` porte le code MECeF 24 caractères de la
        // facture originale. Ajouter originalInvoiceUid provoque une erreur 11.
        payload.reference = ref;
      }

      // POST avec fallback trailing-slash (certains déploiements exigent /api/invoice/)
      let submit;
      try {
        submit = await fetchJson({ url: API, method: 'POST', body: payload });
      } catch (e) {
        if (e?.status === 404 || e?.status === 405) {
          submit = await fetchJson({ url: `${API}/`, method: 'POST', body: payload });
        } else {
          throw new Error(`submit: ${e?.message || e}`);
        }
      }
      if (submit && submit.errorCode && submit.errorCode !== '0') {
        throw new Error(`API error ${submit.errorCode}: ${submit.errorDesc || 'inconnu'}`);
      }
      const uid = submit?.uid;
      if (!uid) throw new Error(`Pas d'UID dans la réponse: ${JSON.stringify(submit).slice(0, 300)}`);

      // confirm avec fallback POST -> PUT (comme electron/main.cjs)
      const confirmUrl = `${API}/${encodeURIComponent(uid)}/confirm`;
      let confirm;
      try {
        confirm = await fetchJson({ url: confirmUrl, method: 'POST' });
      } catch (e) {
        if (e?.status === 404 || e?.status === 405) {
          confirm = await fetchJson({ url: confirmUrl, method: 'PUT' });
        } else {
          throw new Error(`confirm(uid=${uid}): ${e?.message || e}`);
        }
      }
      if (confirm && confirm.errorCode && confirm.errorCode !== '0') {
        throw new Error(`Confirm error ${confirm.errorCode}: ${confirm.errorDesc || 'inconnu'}`);
      }

      results.cases[c.id] = {
        id: c.id,
        label: c.label,
        type: c.type,
        sejour: !!c.sejour,
        payload,
        submit,
        confirm,
        confirmedAt: new Date().toISOString(),
      };
      console.log(`${tag} OK  uid=${uid}  code=${confirm?.codeMECeFDGI}  total=${submit?.total}  compteurs=${confirm?.counters}`);
    } catch (e) {
      results.cases[c.id] = { id: c.id, label: c.label, type: c.type, error: String(e?.message || e), payloadError: e?.payload || null };
      console.error(`${tag} ÉCHEC — ${e?.message || e}`);
    }
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), 'utf8');
  }

  const ok = Object.values(results.cases).filter((x) => x.confirm).length;
  const ko = Object.values(results.cases).filter((x) => x.error).length;
  console.log(`\nTerminé: ${ok} confirmés / ${ko} échecs — résultats: ${resultsPath}`);
};

main().catch((e) => {
  console.error('FATAL:', e?.message || e);
  process.exit(1);
});
