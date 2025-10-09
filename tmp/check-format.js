// Quick check for formatting behavior without importing TypeScript sources
const formatCurrency = (n) => {
  try {
    return n.toLocaleString('fr-FR').replace(/\u202F/g, '\u00A0');
  } catch (e) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  }
};

const nums = [2000, 2360, 1234567, 1000000];
for (const n of nums) {
  const s = formatCurrency(n);
  console.log(JSON.stringify(s), 'codepoints:', [...s].map(c => c.codePointAt(0).toString(16)).join(' '));
}
