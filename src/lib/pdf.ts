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
  discount?: number; // Montant de la remise
  discountType?: 'percentage' | 'fixed'; // Type de remise
}

// Company info (configurable)
const COMPANY_INFO = {
  name: 'Cave Premium Wines',
  address: 'Avenue de la République',
  city: 'Cotonou',
  country: 'Bénin',
  phone: '+229 21 00 00 00',
  email: 'contact@cavepremium.bj',
  ifu: '0123456789012', // IFU (Identifiant Fiscal Unique) - Bénin (13 chiffres)
  rcs: 'RC/ESE/2025/0001', // Registre du Commerce et des Sociétés
  tvaNumber: '0123456789012', // Numéro de TVA (souvent identique à l'IFU au Bénin)
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
  doc.text(`N° TVA: ${COMPANY_INFO.tvaNumber}`, 15, 45);
  doc.text(`RCS: ${COMPANY_INFO.rcs}`, 15, 49);

  // Invoice box on the right
  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setFillColor(245, 245, 245);
  doc.rect(130, 12, 65, 38, 'FD');
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.text('FACTURE', 135, 20);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`N°: ${data.invoiceNumber}`, 135, 26);
  doc.text(`Date d'émission: ${format(new Date(data.date), 'dd/MM/yyyy', { locale: fr })}`, 135, 31);
  // Date d'échéance: 30 jours par défaut
  const dueDate = new Date(data.date);
  dueDate.setDate(dueDate.getDate() + 30);
  doc.text(`Date d'échéance: ${format(dueDate, 'dd/MM/yyyy', { locale: fr })}`, 135, 36);
  if (data.paymentTerms) {
    doc.text(`Conditions: ${data.paymentTerms}`, 135, 41);
  } else {
    doc.text('Paiement: 30 jours', 135, 41);
  }

  // Buyer / Client information
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Facturer à / Client :', 15, 60);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(data.clientName, 15, 66);
  if (data.clientAddress) doc.text(data.clientAddress, 15, 71);
  if (data.clientPhone) doc.text(`Tél: ${data.clientPhone}`, 15, 76);
  if (data.clientIFU) {
    doc.text(`IFU client: ${data.clientIFU}`, 15, 81);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('(Client assujetti à la TVA)', 15, 85);
  }

  // Table header and rows
  const tableStartY = 92;

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

  // Afficher la remise si applicable
  if (data.discount && data.discount > 0) {
    doc.setTextColor(128, 24, 24); // Couleur accent pour la remise
    const discountLabel = data.discountType === 'percentage' 
      ? `Remise (${((data.discount / data.totalHT) * 100).toFixed(1)}%)`
      : 'Remise';
    doc.text(discountLabel, totalsX, y);
    doc.text(`- ${formatCurrency(data.discount)} FCFA`, 195, y, { align: 'right' });
    doc.setTextColor(primary[0], primary[1], primary[2]); // Reset couleur
    y += 6;
    
    // Total HT après remise
    const totalHTAfterDiscount = data.totalHT - data.discount;
    doc.text('Total HT après remise', totalsX, y);
    doc.text(`${formatCurrency(totalHTAfterDiscount)} FCFA`, 195, y, { align: 'right' });
    y += 6;
  }

  doc.text(`TVA (${tvaRate}%)`, totalsX, y);
  doc.text(`${formatCurrency(data.tva)} FCFA`, 195, y, { align: 'right' });
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.text('Total TTC', totalsX, y);
  doc.text(`${formatCurrency(data.totalTTC)} FCFA`, 195, y, { align: 'right' });

  // Payment information box
  const paymentY = y + 12;
  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(0.5);
  doc.rect(15, paymentY, 85, 35);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.text('INFORMATIONS DE PAIEMENT', 18, paymentY + 6);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.text('Modes de règlement acceptés:', 18, paymentY + 12);
  doc.text('• Espèces', 18, paymentY + 17);
  doc.text('• Chèque à l\'ordre de ' + COMPANY_INFO.name, 18, paymentY + 21);
  doc.text('• Virement bancaire', 18, paymentY + 25);
  doc.text('• Mobile Money (MTN/Moov)', 18, paymentY + 29);

  // Signature block
  const sigY = paymentY;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Fait à : ' + COMPANY_INFO.city, 110, sigY + 6);
  doc.text('Le : ' + format(new Date(data.date), 'dd/MM/yyyy', { locale: fr }), 110, sigY + 11);
  doc.setFont('helvetica', 'bold');
  doc.text('Signature et cachet du fournisseur', 110, sigY + 18);
  doc.rect(110, sigY + 20, 85, 25); // signature box

  // Legal footer with OHADA compliance
  const footerY = 270;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('MENTIONS LÉGALES OBLIGATOIRES', 15, footerY);
  
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  let legalY = footerY + 4;
  
  doc.text(`• TVA comprise au taux de ${tvaRate}% conformément à la législation fiscale en vigueur au Bénin.`, 15, legalY);
  legalY += 3.5;
  doc.text('• Facture émise conformément au système OHADA (Organisation pour l\'Harmonisation en Afrique du Droit des Affaires).', 15, legalY);
  legalY += 3.5;
  doc.text('• Mode de règlement accepté: Espèces, Chèque, Virement bancaire, Mobile Money.', 15, legalY);
  legalY += 3.5;
  doc.text('• Pénalités de retard: En cas de retard de paiement, des pénalités au taux de 10% par mois seront appliquées.', 15, legalY);
  legalY += 3.5;
  doc.text('• Document à conserver pour preuve fiscale et comptable pendant une durée légale de 10 ans.', 15, legalY);
  
  // Watermark-style footer
  doc.setFontSize(6);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(150, 150, 150);
  doc.text(`Document généré électroniquement le ${format(new Date(), 'dd/MM/yyyy à HH:mm', { locale: fr })} | ${COMPANY_INFO.name}`, 105, 292, { align: 'center' });

  return doc;
};

export const downloadInvoice = (invoiceNumber: string, doc: jsPDF) => {
  const filename = `Facture_${invoiceNumber}_${format(new Date(), 'yyyyMMdd')}.pdf`;
  doc.save(filename);
};

// Stock Report Types
export interface StockMovementReportData {
  id: string;
  productName: string;
  type: 'in' | 'out' | 'adjustment';
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string;
  date: string;
  operatorName: string;
}

export interface StockReportFilters {
  dateFrom?: string;
  dateTo?: string;
  productId?: string;
  movementType?: 'in' | 'out' | 'adjustment' | 'all';
}

export const generateStockReportPDF = (
  movements: StockMovementReportData[],
  filters: StockReportFilters
): jsPDF => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });

  // Colors
  const primary: [number, number, number] = [40, 40, 40];
  const accent: [number, number, number] = [128, 24, 24];

  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.text('RAPPORT DE MOUVEMENTS DE STOCK', 148, 20, { align: 'center' });

  // Company info
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.text(COMPANY_INFO.name, 15, 35);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`${COMPANY_INFO.address}, ${COMPANY_INFO.city}`, 15, 40);
  doc.text(`Tél: ${COMPANY_INFO.phone} | Email: ${COMPANY_INFO.email}`, 15, 45);

  // Report info (date range, filters)
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Informations du rapport :', 200, 35);
  doc.setFont('helvetica', 'normal');
  let infoY = 40;
  
  if (filters.dateFrom || filters.dateTo) {
    const dateRange = `Du ${filters.dateFrom ? format(new Date(filters.dateFrom), 'dd/MM/yyyy', { locale: fr }) : '...'} au ${filters.dateTo ? format(new Date(filters.dateTo), 'dd/MM/yyyy', { locale: fr }) : '...'}`;
    doc.text(`Période: ${dateRange}`, 200, infoY);
    infoY += 5;
  } else {
    doc.text('Période: Tous les mouvements', 200, infoY);
    infoY += 5;
  }

  if (filters.movementType && filters.movementType !== 'all') {
    const typeLabel = filters.movementType === 'in' ? 'Entrées' : filters.movementType === 'out' ? 'Sorties' : 'Ajustements';
    doc.text(`Type: ${typeLabel}`, 200, infoY);
    infoY += 5;
  } else {
    doc.text('Type: Tous les types', 200, infoY);
    infoY += 5;
  }

  doc.text(`Date d'édition: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: fr })}`, 200, infoY);
  infoY += 5;
  doc.text(`Nombre de mouvements: ${movements.length}`, 200, infoY);

  // Summary statistics
  const totalIn = movements.filter(m => m.type === 'in').reduce((sum, m) => sum + m.quantity, 0);
  const totalOut = movements.filter(m => m.type === 'out').reduce((sum, m) => sum + Math.abs(m.quantity), 0);
  const adjustments = movements.filter(m => m.type === 'adjustment').length;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Résumé :', 15, 55);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(34, 139, 34); // Green for entries
  doc.text(`Entrées: +${totalIn} unités`, 15, 60);
  doc.setTextColor(220, 20, 60); // Red for exits
  doc.text(`Sorties: -${totalOut} unités`, 60, 60);
  doc.setTextColor(255, 140, 0); // Orange for adjustments
  doc.text(`Ajustements: ${adjustments}`, 110, 60);
  doc.setTextColor(primary[0], primary[1], primary[2]); // Reset color

  // Table
  const tableStartY = 70;

  const tableData = movements.map(m => {
    const typeLabel = m.type === 'in' ? 'Entrée' : m.type === 'out' ? 'Sortie' : 'Ajustement';
    const quantityDisplay = m.quantity > 0 ? `+${m.quantity}` : String(m.quantity);
    return [
      format(new Date(m.date), 'dd/MM/yyyy HH:mm', { locale: fr }),
      typeLabel,
      m.productName,
      quantityDisplay,
      String(m.previousStock),
      String(m.newStock),
      m.reason,
      m.operatorName,
    ];
  });

  autoTable(doc, {
    startY: tableStartY,
    head: [[
      { content: 'Date', styles: { halign: 'left' } },
      { content: 'Type', styles: { halign: 'center' } },
      { content: 'Produit', styles: { halign: 'left' } },
      { content: 'Qté', styles: { halign: 'right' } },
      { content: 'Stock Avant', styles: { halign: 'right' } },
      { content: 'Stock Après', styles: { halign: 'right' } },
      { content: 'Motif', styles: { halign: 'left' } },
      { content: 'Opérateur', styles: { halign: 'left' } },
    ]],
    body: tableData,
    theme: 'grid',
    headStyles: { 
      fillColor: [accent[0], accent[1], accent[2]] as [number, number, number], 
      textColor: [255, 255, 255] as [number, number, number], 
      fontStyle: 'bold',
      fontSize: 8,
    },
    styles: { fontSize: 7, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 30 }, // Date
      1: { cellWidth: 20 }, // Type
      2: { cellWidth: 50 }, // Produit
      3: { cellWidth: 15 }, // Qté
      4: { cellWidth: 20 }, // Stock Avant
      5: { cellWidth: 20 }, // Stock Après
      6: { cellWidth: 60 }, // Motif
      7: { cellWidth: 25 }, // Opérateur
    },
    didParseCell: (data) => {
      // Color-code the Type column
      if (data.column.index === 1 && data.section === 'body') {
        const type = movements[data.row.index]?.type;
        if (type === 'in') {
          data.cell.styles.textColor = [34, 139, 34]; // Green
        } else if (type === 'out') {
          data.cell.styles.textColor = [220, 20, 60]; // Red
        } else if (type === 'adjustment') {
          data.cell.styles.textColor = [255, 140, 0]; // Orange
        }
      }
      // Color-code the Quantity column
      if (data.column.index === 3 && data.section === 'body') {
        const qty = movements[data.row.index]?.quantity;
        if (qty > 0) {
          data.cell.styles.textColor = [34, 139, 34]; // Green
          data.cell.styles.fontStyle = 'bold';
        } else if (qty < 0) {
          data.cell.styles.textColor = [220, 20, 60]; // Red
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  // Footer
  const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  const finalY = last ? last.finalY + 10 : tableStartY + 100;

  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Rapport généré le ${format(new Date(), 'dd/MM/yyyy à HH:mm', { locale: fr })} | ${COMPANY_INFO.name}`,
    148,
    finalY < 190 ? 190 : finalY,
    { align: 'center' }
  );

  return doc;
};

export const downloadStockReport = (doc: jsPDF, filters: StockReportFilters) => {
  const dateStr = format(new Date(), 'yyyyMMdd_HHmm');
  let filename = `Rapport_Stock_${dateStr}`;
  
  if (filters.dateFrom || filters.dateTo) {
    const fromStr = filters.dateFrom ? format(new Date(filters.dateFrom), 'yyyyMMdd') : 'debut';
    const toStr = filters.dateTo ? format(new Date(filters.dateTo), 'yyyyMMdd') : 'fin';
    filename = `Rapport_Stock_${fromStr}_${toStr}`;
  }
  
  doc.save(`${filename}.pdf`);
};
