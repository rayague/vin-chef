import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export interface InvoiceData {
  invoiceNumber: string;
  date: string;
  clientName: string;
  clientAddress?: string;
  clientPhone?: string;
  clientIFU?: string;
  productName: string;
  quantity: number;
  unitPrice: number; // prix unitaire HT
  tvaRate?: number; // ex: 18 for 18%
  totalHT: number;
  tva: number;
  totalTTC: number;
  paymentTerms?: string;
}

// Company info (configurable)
const COMPANY_INFO = {
  name: 'Cave Premium Wines',
  address: 'Avenue de la République',
  city: 'Cotonou',
  country: 'Bénin',
  phone: '+229 21 00 00 00',
  email: 'contact@cavepremium.bj',
  ifu: '0123456789012', // IFU (Identifiant Fiscal Unique) - Bénin
  rcs: 'RC/ESE/2025/0001',
};
// Helper to format numbers for PDF: replace narrow no-break space (U+202F)
// which some locales use as thousands separator (e.g. fr-FR) with a
// regular non-breaking space (U+00A0). jsPDF's font handling can
// mis-render U+202F and insert unwanted spacing between characters.
export const formatCurrency = (n: number) => {
  try {
    return n.toLocaleString('fr-FR').replace(/\u202F/g, '\u00A0');
  } catch (e) {
    // Fallback: simple grouping
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  }
};

export const generateInvoicePDF = (data: InvoiceData): jsPDF => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // Colors
  const primary: [number, number, number] = [40, 40, 40];
  const accent: [number, number, number] = [128, 24, 24];

  // Header: company left, invoice meta right
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(COMPANY_INFO.name, 15, 20);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${COMPANY_INFO.address}`, 15, 25);
  doc.text(`${COMPANY_INFO.city} - ${COMPANY_INFO.country}`, 15, 29);
  doc.text(`Tél: ${COMPANY_INFO.phone}`, 15, 33);
  doc.text(`Email: ${COMPANY_INFO.email}`, 15, 37);
  doc.text(`IFU: ${COMPANY_INFO.ifu}`, 15, 41);
  doc.text(`RCS: ${COMPANY_INFO.rcs}`, 15, 45);

  // Invoice box on the right
  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setFillColor(245, 245, 245);
  doc.rect(130, 12, 65, 32, 'FD');
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.text('FACTURE', 135, 20);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`N°: ${data.invoiceNumber}`, 135, 26);
  doc.text(`Date: ${format(new Date(data.date), 'dd/MM/yyyy', { locale: fr })}`, 135, 31);
  if (data.paymentTerms) doc.text(`Conditions: ${data.paymentTerms}`, 135, 36);

  // Buyer / Client information
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Facturer à / Client :', 15, 55);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(data.clientName, 15, 61);
  if (data.clientAddress) doc.text(data.clientAddress, 15, 66);
  if (data.clientPhone) doc.text(`Tél: ${data.clientPhone}`, 15, 71);
  if (data.clientIFU) doc.text(`IFU client: ${data.clientIFU}`, 15, 76);

  // Table header and rows
  const tableStartY = 85;

  const tvaRate = data.tvaRate ?? 18;

  autoTable(doc, {
    startY: tableStartY,
    head: [[
      { content: 'Désignation', styles: { halign: 'left' } },
      { content: 'Qté', styles: { halign: 'center' } },
      { content: 'P.U. HT (FCFA)', styles: { halign: 'right' } },
      { content: 'Total HT (FCFA)', styles: { halign: 'right' } },
      { content: 'TVA %', styles: { halign: 'right' } },
      { content: 'Montant TVA (FCFA)', styles: { halign: 'right' } },
    ]],
    body: [[
      data.productName,
      String(data.quantity),
  formatCurrency(data.unitPrice),
  formatCurrency(data.totalHT),
      `${tvaRate}%`,
      formatCurrency(data.tva),
    ]],
    theme: 'grid',
  headStyles: { fillColor: [accent[0], accent[1], accent[2]] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 15 },
      2: { cellWidth: 30 },
      3: { cellWidth: 30 },
      4: { cellWidth: 15 },
      5: { cellWidth: 30 },
    },
  });

  const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  const finalY = last ? last.finalY + 8 : tableStartY + 30;

  // Totals block
  const totalsX = 130;
  let y = finalY;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Total HT', totalsX, y);
  doc.text(`${formatCurrency(data.totalHT)} FCFA`, 195, y, { align: 'right' });
  y += 6;

  doc.text(`TVA (${tvaRate}%)`, totalsX, y);
  doc.text(`${formatCurrency(data.tva)} FCFA`, 195, y, { align: 'right' });
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.text('Total TTC', totalsX, y);
  doc.text(`${formatCurrency(data.totalTTC)} FCFA`, 195, y, { align: 'right' });

  // Signature block
  const sigY = y + 18;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Fait à : ' + COMPANY_INFO.city + ', le ' + format(new Date(data.date), 'dd/MM/yyyy', { locale: fr }), 15, sigY);
  doc.text('Nom et signature du fournisseur :', 15, sigY + 8);
  doc.rect(15, sigY + 10, 70, 25); // signature box

  // Legal footer
  const footerY = 280;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.text('Mentions légales: Conserver ce document pour preuve fiscale. La TVA est appliquée selon la législation en vigueur au Bénin.', 15, footerY);

  return doc;
};

export const downloadInvoice = (invoiceNumber: string, doc: jsPDF) => {
  const filename = `Facture_${invoiceNumber}_${format(new Date(), 'yyyyMMdd')}.pdf`;
  doc.save(filename);
};
