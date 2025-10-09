import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { generateInvoicePDF } from '../src/lib/pdf.js';

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

// generate
const doc = generateInvoicePDF(sample);

// save to tmp/sample-invoice.pdf
const outDir = path.resolve(process.cwd(), 'tmp');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const pdfData = doc.output();
// jsPDF output() returns string in older versions; use output('arraybuffer') if supported
let buffer;
if (typeof pdfData === 'string') {
  buffer = Buffer.from(pdfData, 'binary');
} else if (pdfData instanceof ArrayBuffer) {
  buffer = Buffer.from(pdfData);
} else {
  // try blob
  try {
    const ab = doc.output('arraybuffer');
    buffer = Buffer.from(ab);
  } catch (e) {
    console.error('Could not serialize PDF output', e);
    process.exit(1);
  }
}

const outPath = path.join(outDir, 'sample-invoice.pdf');
fs.writeFileSync(outPath, buffer);
console.log('Wrote PDF to', outPath);
