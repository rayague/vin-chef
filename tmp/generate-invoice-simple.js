const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
require('jspdf-autotable');

const formatCurrency = (n) => {
  try {
    return n.toLocaleString('fr-FR').replace(/\u202F/g, '\u00A0');
  } catch (e) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  }
};

const sample = {
  invoiceNumber: 'FAC-2025-00002',
  date: new Date().toISOString(),
  clientName: 'Hôtel Royal Palace',
  clientAddress: 'Porto-Novo, Bénin',
  clientPhone: '+229 97 00 00 02',
  clientIFU: '9876543210001',
  productName: 'dngfn',
  quantity: 1,
  unitPrice: 2000,
  tvaRate: 18,
  totalHT: 2000,
  tva: 360,
  totalTTC: 2360,
  paymentTerms: 'À réception',
};

const doc = new jsPDF({ unit: 'mm', format: 'a4' });
doc.setFontSize(14);
doc.text('Cave Premium Wines', 15, 20);
doc.setFontSize(10);
doc.text('FACTURE', 150, 20);

doc.setFontSize(11);
doc.text('Facturer à / Client :', 15, 55);
doc.setFontSize(10);
doc.text(sample.clientName, 15, 61);

doc.autoTable({
  startY: 85,
  head: [['Désignation', 'Qté', 'P.U. HT (FCFA)', 'Total HT (FCFA)', 'TVA %', 'Montant TVA (FCFA)']],
  body: [[sample.productName, String(sample.quantity), formatCurrency(sample.unitPrice), formatCurrency(sample.totalHT), `${sample.tvaRate}%`, formatCurrency(sample.tva)]],
  theme: 'grid',
});

const buf = Buffer.from(doc.output('arraybuffer'));
const outDir = path.resolve(process.cwd(), 'tmp');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'sample-invoice.pdf'), buf);
console.log('Wrote tmp/sample-invoice.pdf');
