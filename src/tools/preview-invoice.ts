import { generateInvoicePDF } from '../lib/pdf';

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

const doc = generateInvoicePDF(sample as any);
// Save to a file in project root (Node environment) is not possible here without fs bindings
// Instead, print a success message indicating we generated the doc object
console.log('Generated PDF jsPDF object with num pages:', (doc as any).getNumberOfPages());
