import { generateInvoicePDF, InvoiceData } from '../lib/pdf';
import jsPDF from 'jspdf';
import logger from '@/lib/logger';

const sample: InvoiceData = {
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

const doc: jsPDF = generateInvoicePDF(sample);
// Save to a file in project root (Node environment) is not possible here without fs bindings
// Instead, print a success message indicating we generated the doc object
logger.info('Generated PDF jsPDF object with num pages:', typeof doc.getNumberOfPages === 'function' ? doc.getNumberOfPages() : 1);
