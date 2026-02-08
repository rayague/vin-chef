export const formatMecEfCode = (code?: string) => {
  const raw = String(code || '').replace(/\s+/g, '').trim();
  if (!raw) return '';
  const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const chunks = clean.match(/.{1,5}/g) || [clean];
  return chunks.join('-');
};
