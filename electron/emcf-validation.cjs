const crypto = require('crypto');

const ALLOWED_TAX_GROUPS = new Set(['A', 'B', 'C', 'D', 'E', 'EXPORT']);
const ALLOWED_AIB_RATES = new Set([0, 1, 5]);

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

const toNumber = (v) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const safeTrim = (v) => {
  const s = String(v ?? '').trim();
  return s ? s : '';
};

const calcVatRateForTaxGroup = (taxGroup) => {
  const tg = safeTrim(taxGroup).toUpperCase();
  // Barème TVA officiel DGI (e-MECeF)
  // A: Exonéré (0%), B: Normal (18%), C: Réduit (10%), D: Spécial (5%), E: Zéro (0%), EXPORT: Export (0%)
  const rates = {
    A: 0,
    B: 18,
    C: 10,
    D: 5,
    E: 0,
    EXPORT: 0,
  };
  return Object.prototype.hasOwnProperty.call(rates, tg) ? rates[tg] : 0;
};

const calculateVatForItem = (item) => {
  const qty = toNumber(item?.quantity);
  const unitPrice = toNumber(item?.unitPrice);
  if (qty === null || unitPrice === null) return 0;
  const base = qty * unitPrice;
  const rate = calcVatRateForTaxGroup(item?.taxGroup);
  return Math.round((base * rate) / 100);
};

const calculateAIB = (subtotal, rate) => {
  const sub = toNumber(subtotal);
  const r = toNumber(rate);
  if (sub === null || r === null) return 0;
  return Math.round((sub * r) / 100);
};

const hashObject = (obj) => {
  try {
    return crypto.createHash('sha256').update(JSON.stringify(obj ?? null)).digest('hex');
  } catch {
    return crypto.createHash('sha256').update(String(Date.now())).digest('hex');
  }
};

const validateInvoicePayload = (payload) => {
  if (!isPlainObject(payload)) throw new Error('PAYLOAD_INVALIDE: payload doit être un objet');

  const type = safeTrim(payload.type || 'FV').toUpperCase();

  if (type.includes('AV')) {
    const hasReference = !!(payload.originalInvoiceReference || payload.reference || payload.originalInvoiceUid);
    if (!hasReference) {
      throw new Error(
        "AVOIR_REFERENCE_MANQUANTE: Pour une facture d'avoir (AV), au moins une référence (code MECeF, UID ou reference) est obligatoire"
      );
    }
  }

  if (!payload.customer && !payload.client) {
    throw new Error('CLIENT_MANQUANT: Au moins customer ou client doit être fourni');
  }

  const items = Array.isArray(payload.items) ? payload.items : null;
  if (!items || items.length === 0) throw new Error('ARTICLES_MANQUANTS: Au moins un article est requis');

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const name = safeTrim(item?.name || item?.description || '');
    const taxGroup = safeTrim(item?.taxGroup).toUpperCase();
    if (!taxGroup || !ALLOWED_TAX_GROUPS.has(taxGroup)) {
      throw new Error(
        `ARTICLE_TAXGROUP_INVALIDE: Article ${index}${name ? ` (${name})` : ''} - taxGroup invalide ou manquant. Valeurs autorisées: A,B,C,D,E,EXPORT`
      );
    }
    const qty = toNumber(item?.quantity);
    const unitPrice = toNumber(item?.unitPrice);
    if (qty === null || qty <= 0) {
      throw new Error(`ARTICLE_QUANTITE_INVALIDE: Article ${index}${name ? ` (${name})` : ''} - quantité invalide`);
    }
    if (unitPrice === null || unitPrice < 0) {
      throw new Error(`ARTICLE_PRIX_INVALIDE: Article ${index}${name ? ` (${name})` : ''} - prix unitaire invalide`);
    }
  }

  if (payload.aibRate !== undefined && payload.aibRate !== null) {
    const aibRate = toNumber(payload.aibRate);
    if (aibRate === null || !ALLOWED_AIB_RATES.has(aibRate)) {
      throw new Error('AI_RATE_INVALIDE: Le taux AIB doit être 0, 1 ou 5');
    }
  }

  if (payload.payment && !Array.isArray(payload.payment)) {
    throw new Error('PAIEMENT_INVALIDE: payment doit être un tableau');
  }

  return true;
};

const normalizePayment = (payload, computedTotal) => {
  const pm = Array.isArray(payload.paymentMethods) ? payload.paymentMethods : null;
  const p = Array.isArray(payload.payment) ? payload.payment : null;

  const toLine = (x) => {
    const amount = toNumber(x?.amount);
    if (amount === null || amount <= 0) return null;
    const rawName = safeTrim(x?.name || x?.mode || x?.paymentMode || x?.payment_mode || 'ESPECES');
    const name = rawName.toUpperCase();
    return { name, amount };
  };

  const lines = (pm || p || []).map(toLine).filter(Boolean);
  if (lines.length > 0) return lines;

  return [{ name: 'ESPECES', amount: computedTotal }];
};

const normalizeCustomer = (payload) => {
  if (payload.customer && isPlainObject(payload.customer)) {
    const c = payload.customer;
    return {
      ifu: safeTrim(c.ifu) || null,
      name: safeTrim(c.name) || 'Client non spécifié',
      address: safeTrim(c.address) || null,
      contact: safeTrim(c.contact || c.phone || c.contactInfo || c.contact_info) || null,
    };
  }

  const cl = payload.client && isPlainObject(payload.client) ? payload.client : {};
  return {
    ifu: safeTrim(cl.ifu) || null,
    name: safeTrim(cl.name) || 'Client non spécifié',
    address: safeTrim(cl.address) || null,
    contact: safeTrim(cl.contact || cl.phone || cl.contactInfo || cl.contact_info) || null,
  };
};

const normalizeItems = (payload) => {
  const items = Array.isArray(payload.items) ? payload.items : [];
  return items.map((item) => {
    const taxGroup = safeTrim(item?.taxGroup).toUpperCase();
    const quantity = toNumber(item?.quantity) ?? 0;
    const unitPrice = toNumber(item?.unitPrice) ?? 0;
    const vatAmount = calculateVatForItem({ ...item, taxGroup, quantity, unitPrice });
    const totalAmount = Math.round(quantity * unitPrice);
    return {
      name: safeTrim(item?.name || item?.description || 'Article'),
      quantity,
      unitPrice,
      taxGroup,
      vatAmount,
      totalAmount,
    };
  });
};

const formatDateTimeForEmcf = (d) => {
  const format = String(process.env.EMCF_DATE_FORMAT || 'iso').trim().toLowerCase();
  if (format !== 'dgi') return d.toISOString();
  // Format DGI: DD/MM/YYYY HH:MM:SS
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const normalizeEmcfPayload = (payload, emcfInfo = {}) => {
  const p = isPlainObject(payload) ? payload : {};
  const type = safeTrim(p.type || 'FV').toUpperCase();

  const items = normalizeItems(p);
  const subtotal = items.reduce((s, it) => s + (toNumber(it.totalAmount) ?? 0), 0);
  const totalVat = items.reduce((s, it) => s + (toNumber(it.vatAmount) ?? 0), 0);

  const aibRate = p.aibRate !== undefined && p.aibRate !== null ? (toNumber(p.aibRate) ?? 0) : 0;
  const aibAmount = calculateAIB(subtotal, aibRate);

  const total = subtotal + totalVat + aibAmount;

  const payment = normalizePayment(p, total);

  const normalized = {
    ...(emcfInfo && emcfInfo.nim ? { nim: String(emcfInfo.nim) } : {}),
    ...(emcfInfo && emcfInfo.ifu ? { ifuVendeur: String(emcfInfo.ifu) } : {}),
    dateTime: formatDateTimeForEmcf(new Date()),
    ...p,
    type,
    customer: normalizeCustomer(p),
    items,
    payment,
    aibRate,
    aibAmount,
    subtotal,
    total,
  };

  if (type.includes('AV')) {
    normalized.originalInvoiceReference =
      safeTrim(p.originalInvoiceReference) || safeTrim(p.reference) || safeTrim(p.originalInvoiceUid) || null;
    normalized.reference = safeTrim(p.reference) || null;
    normalized.originalInvoiceUid = safeTrim(p.originalInvoiceUid) || null;
  }

  return normalized;
};

const makeSafeLogMeta = (normalizedPayload) => {
  const itemsForHash = Array.isArray(normalizedPayload?.items)
    ? normalizedPayload.items.map((it) => ({ taxGroup: it.taxGroup, quantity: it.quantity, unitPrice: it.unitPrice }))
    : [];

  const customerForHash = normalizedPayload?.customer
    ? { ifu: normalizedPayload.customer.ifu || null, name: normalizedPayload.customer.name || '' }
    : null;

  return {
    timestamp: new Date().toISOString(),
    type: normalizedPayload?.type,
    nbItems: Array.isArray(normalizedPayload?.items) ? normalizedPayload.items.length : 0,
    aibRate: normalizedPayload?.aibRate,
    hasAVReference: !!normalizedPayload?.originalInvoiceReference,
    itemsHash: hashObject(itemsForHash),
    customerHash: hashObject(customerForHash),
  };
};

module.exports = {
  validateInvoicePayload,
  normalizeEmcfPayload,
  calculateVatForItem,
  calculateAIB,
  makeSafeLogMeta,
};
