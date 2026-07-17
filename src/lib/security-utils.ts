export const formatMecEfCode = (code?: string) => {
  const raw = String(code || '').replace(/\s+/g, '').trim();
  if (!raw) return '';
  const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  // Format officiel DGI : code MECeF de 24 caractères affiché en 6 groupes de 4
  // (ex: TEST-RKVX-MUU3-LUA2-KHOG-FEFB) — identique à l'affichage SYGMEF.
  const chunks = clean.match(/.{1,4}/g) || [clean];
  return chunks.join('-');
};
