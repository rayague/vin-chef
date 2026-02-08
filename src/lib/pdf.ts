import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { formatMecEfCode } from '@/lib/security-utils';

export interface InvoiceData {
  invoiceNumber: string;
  date: string;
  clientName: string;
  clientAddress?: string;
  clientPhone?: string;
  clientIFU?: string;
  logoDataUrl?: string;
  emcfCodeMECeFDGI?: string;
  emcfQrCode?: string;
  emcfQrCodeDataUrl?: string;
  emcfDateTime?: string;
  emcfCounters?: string;
  emcfNim?: string;
  // Single-product fields (kept for backward compatibility)
  productName?: string;
  quantity?: number;
  unitPrice?: number; // prix unitaire HT
  // Multi-item support
  items?: { description: string; quantity: number; unitPrice: number; discount?: number }[];
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
  ifu: '0202368226611',
  nim: 'TS01017752',
  rcs: 'RC/ESE/2025/0001', // Registre du Commerce et des Sociétés
  tvaNumber: '0202368226611',
};

let cachedInvoiceLogoDataUrl: string | null | undefined;

export const getInvoiceLogoDataUrl = async (): Promise<string | null> => {
  if (cachedInvoiceLogoDataUrl !== undefined) return cachedInvoiceLogoDataUrl;
  try {
    const res = await fetch('/logo_vin.jpeg');
    if (!res.ok) {
      cachedInvoiceLogoDataUrl = null;
      return null;
    }
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read logo'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });
    cachedInvoiceLogoDataUrl = dataUrl || null;
    return cachedInvoiceLogoDataUrl;
  } catch {
    cachedInvoiceLogoDataUrl = null;
    return null;
  }
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
  const accent: [number, number, number] = [184, 134, 11];

  // Header: logo + company left, invoice meta right
  const headerTop = 12;
  const logoSize = 18;
  const invoiceBoxX = 130;
  const invoiceBoxY = 12;
  const invoiceBoxW = 65;
  const invoiceBoxH = 56;
  if (data.logoDataUrl) {
    try {
      doc.addImage(data.logoDataUrl, 'JPEG', 15, headerTop + 2, logoSize, logoSize);
    } catch {
      // ignore
    }
  }

  const companyX = data.logoDataUrl ? 15 + logoSize + 4 : 15;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(COMPANY_INFO.name, companyX, 20);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${COMPANY_INFO.address}`, companyX, 25);
  doc.text(`${COMPANY_INFO.city} - ${COMPANY_INFO.country}`, companyX, 29);
  doc.text(`Tél: ${COMPANY_INFO.phone}`, companyX, 33);
  doc.text(`Email: ${COMPANY_INFO.email}`, companyX, 37);
  doc.text(`IFU: ${COMPANY_INFO.ifu}`, companyX, 41);
  doc.text(`NIM: ${COMPANY_INFO.nim}`, companyX, 45);
  doc.text(`RCS: ${COMPANY_INFO.rcs}`, companyX, 49);
  doc.text(`N° TVA: ${COMPANY_INFO.tvaNumber}`, companyX, 53);
  const companyBottomY = 53;

  // Invoice box on the right
  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setFillColor(245, 245, 245);
  doc.rect(invoiceBoxX, invoiceBoxY, invoiceBoxW, invoiceBoxH, 'FD');
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

  // (QR code e-MECeF affiché sous le tableau, à côté des totaux)

  // e-MCF info (when available)
  if (data.emcfCodeMECeFDGI || data.emcfQrCode || data.emcfNim || data.emcfCounters || data.emcfDateTime) {
    const boxTop = invoiceBoxY;
    const boxHeight = invoiceBoxH;
    const boxBottom = boxTop + boxHeight;

    const emcfX = 135;
    const emcfMaxWidth = 58;

    const writeLines = (lines: string[], yStart: number) => {
      let y = yStart;
      for (let i = 0; i < lines.length; i++) {
        if (y > boxBottom - 3) return { y, truncated: true };
        doc.text(lines[i], emcfX, y);
        y += 3.5;
      }
      return { y, truncated: false };
    };

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(accent[0], accent[1], accent[2]);
    doc.text('e-MCF', emcfX, 46);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(primary[0], primary[1], primary[2]);
    let emcfY = 49;
    if (data.emcfCodeMECeFDGI) {
      const lines = doc.splitTextToSize(`Code: ${data.emcfCodeMECeFDGI}`, emcfMaxWidth) as string[];
      const r = writeLines(lines, emcfY);
      emcfY = r.y;
    }
    if (data.emcfDateTime) {
      const lines = doc.splitTextToSize(`Date/Heure: ${data.emcfDateTime}`, emcfMaxWidth) as string[];
      const r = writeLines(lines, emcfY);
      emcfY = r.y;
    }
    if (data.emcfNim) {
      const lines = doc.splitTextToSize(`NIM: ${data.emcfNim}`, emcfMaxWidth) as string[];
      const r = writeLines(lines, emcfY);
      emcfY = r.y;
    }
    if (data.emcfCounters) {
      const lines = doc.splitTextToSize(`Compteurs: ${data.emcfCounters}`, emcfMaxWidth) as string[];
      const r = writeLines(lines, emcfY);
      emcfY = r.y;
    }
  }

  // Buyer / Client information
  const headerBottomY = Math.max(companyBottomY, invoiceBoxY + invoiceBoxH);
  const clientStartY = headerBottomY + 10;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Facturer à / Client :', 15, clientStartY);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  let clientY = clientStartY + 6;
  doc.text(data.clientName, 15, clientY);
  clientY += 5;
  if (data.clientAddress) {
    const lines = doc.splitTextToSize(String(data.clientAddress), 100) as string[];
    doc.text(lines, 15, clientY);
    clientY += 4 * lines.length;
  }
  if (data.clientPhone) {
    doc.text(`Tél: ${data.clientPhone}`, 15, clientY);
    clientY += 5;
  }
  if (data.clientIFU) {
    doc.text(`IFU client: ${data.clientIFU}`, 15, clientY);
    clientY += 4;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('(Client assujetti à la TVA)', 15, clientY);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    clientY += 5;
  }

  // Table header and rows
  const tableStartY = Math.max(clientY + 6, clientStartY + 26);

  const tvaRate = data.tvaRate ?? 18;

  // Build table rows from items or single-product fields
  const rows: Array<Array<string>> = [];
  if (data.items && data.items.length > 0) {
    data.items.forEach(item => {
      const lineTotal = item.unitPrice * item.quantity - (item.discount || 0);
      rows.push([item.description, String(item.quantity), formatCurrency(item.unitPrice), formatCurrency(lineTotal), `${tvaRate}%`, formatCurrency((lineTotal * tvaRate) / 100)]);
    });
  } else {
    rows.push([
      data.productName || '-',
      String(data.quantity || 0),
      formatCurrency(data.unitPrice || 0),
      formatCurrency(data.totalHT),
      `${tvaRate}%`,
      formatCurrency(data.tva),
    ]);
  }

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
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: [accent[0], accent[1], accent[2]] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 62 },
      1: { cellWidth: 15 },
      2: { cellWidth: 28 },
      3: { cellWidth: 28 },
      4: { cellWidth: 15 },
      5: { cellWidth: 30 },
    },
  });

  const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  const finalY = last ? last.finalY + 8 : tableStartY + 30;

  // Totals block
  const totalsBoxX = 110;
  const totalsBoxW = 85;
  const totalsBoxTop = finalY;
  const totalsLineH = 6;
  const hasDiscount = Boolean(data.discount && data.discount > 0);
  const totalsPadTop = 10;
  const totalsPadBottom = 6;
  const totalsLinesBeforeSeparator = hasDiscount ? 4 : 2; // HT, (remise, HT après remise), TVA
  const totalsExtraAfterTva = totalsLineH; // corresponds to: y += totalsLineH (before drawing separator)
  const totalsExtraAfterSeparator = totalsLineH + 1; // corresponds to: y += totalsLineH + 1 (after drawing separator)
  const totalsLinesAfterSeparator = 1; // TTC
  const totalsBoxH =
    totalsPadTop +
    totalsLinesBeforeSeparator * totalsLineH +
    totalsExtraAfterTva +
    totalsExtraAfterSeparator +
    totalsLinesAfterSeparator * totalsLineH +
    totalsPadBottom;

  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(0.5);
  doc.setFillColor(248, 248, 248);
  doc.rect(totalsBoxX, totalsBoxTop, totalsBoxW, totalsBoxH, 'FD');

  const totalsLabelX = totalsBoxX + 6;
  const totalsValueX = totalsBoxX + totalsBoxW - 6;
  let y = totalsBoxTop + totalsPadTop;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Total HT', totalsLabelX, y);
  doc.text(`${formatCurrency(data.totalHT)} FCFA`, totalsValueX, y, { align: 'right' });
  y += totalsLineH;

  // Afficher la remise si applicable
  if (data.discount && data.discount > 0) {
    doc.setTextColor(128, 24, 24); // Couleur accent pour la remise
    const discountLabel = data.discountType === 'percentage' 
      ? `Remise (${((data.discount / data.totalHT) * 100).toFixed(1)}%)`
      : 'Remise';
    doc.text(discountLabel, totalsLabelX, y);
    doc.text(`- ${formatCurrency(data.discount)} FCFA`, totalsValueX, y, { align: 'right' });
    doc.setTextColor(primary[0], primary[1], primary[2]); // Reset couleur
    y += totalsLineH;
    
    // Total HT après remise
    const totalHTAfterDiscount = data.totalHT - data.discount;
    doc.text('Total HT après remise', totalsLabelX, y);
    doc.text(`${formatCurrency(totalHTAfterDiscount)} FCFA`, totalsValueX, y, { align: 'right' });
    y += totalsLineH;
  }

  doc.text(`TVA (${tvaRate}%)`, totalsLabelX, y);
  doc.text(`${formatCurrency(data.tva)} FCFA`, totalsValueX, y, { align: 'right' });
  y += totalsLineH;

  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.2);
  doc.line(totalsBoxX + 6, y + 1, totalsBoxX + totalsBoxW - 6, y + 1);
  y += totalsLineH + 1;

  doc.setFont('helvetica', 'bold');
  doc.text('Total TTC', totalsLabelX, y);
  doc.text(`${formatCurrency(data.totalTTC)} FCFA`, totalsValueX, y, { align: 'right' });

  // e-MECeF QR + code MECeF (sous le tableau, sur la même ligne que les totaux)
  if (data.emcfQrCodeDataUrl) {
    try {
      const qrSize = 38;
      const qrPad = 4;
      const qrX = 15 + qrPad;
      const qrY = totalsBoxTop + qrPad;

      doc.setDrawColor(210, 210, 210);
      doc.setLineWidth(0.2);
      doc.rect(qrX - 1.5, qrY - 1.5, qrSize + 3, qrSize + 3);
      doc.addImage(data.emcfQrCodeDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

      const formatted = formatMecEfCode(data.emcfCodeMECeFDGI);
      if (formatted) {
        doc.setFont('courier', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(primary[0], primary[1], primary[2]);
        const codeLines = doc.splitTextToSize(formatted, qrSize + 8) as string[];
        doc.text(codeLines, qrX + qrSize / 2, qrY + qrSize + 4, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
      }
    } catch {
      // ignore
    }
  }

  // Payment information box
  const paymentY = totalsBoxTop + totalsBoxH + 10;
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
  const sigBoxX = 110;
  const sigBoxW = 85;
  const sigBoxH = 35;
  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(0.5);
  doc.rect(sigBoxX, sigY, sigBoxW, sigBoxH);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.text(`Fait à : ${COMPANY_INFO.city}`, sigBoxX + 4, sigY + 7);
  doc.text(`Le : ${format(new Date(data.date), 'dd/MM/yyyy', { locale: fr })}`, sigBoxX + 4, sigY + 12);
  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.2);
  doc.line(sigBoxX + 4, sigY + 15, sigBoxX + sigBoxW - 4, sigY + 15);
  doc.setFont('helvetica', 'bold');
  doc.text('Signature et cachet du fournisseur', sigBoxX + sigBoxW / 2, sigY + 20, { align: 'center' });
  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(0.3);
  doc.rect(sigBoxX + 4, sigY + 22, sigBoxW - 8, sigBoxH - 26); // signature box

  // Legal footer with OHADA compliance
  const pageHeight = (doc as unknown as { internal: { pageSize: { getHeight: () => number } } }).internal.pageSize.getHeight();
  const footerTopMargin = 12;
  const minFooterY = Math.max(paymentY + 35, sigY + sigBoxH) + 10;
  let footerY = Math.max(minFooterY, 240);
  if (footerY + 26 > pageHeight - footerTopMargin) {
    doc.addPage();
    footerY = 20;
  }
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
  const footerBottomY = Math.min(pageHeight - 5, footerY + 22);
  doc.text(`Document généré électroniquement le ${format(new Date(), 'dd/MM/yyyy à HH:mm', { locale: fr })} | ${COMPANY_INFO.name}`, 105, footerBottomY, { align: 'center' });

  // Footer sécurité e-MECeF (si disponible)
  if (data.emcfCodeMECeFDGI || data.emcfNim || data.emcfDateTime) {
    const secY = footerY + 18;
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    const parts: string[] = [];
    const code = formatMecEfCode(data.emcfCodeMECeFDGI);
    if (code) parts.push(`Code MECeF: ${code}`);
    if (data.emcfNim) parts.push(`NIM: ${String(data.emcfNim)}`);
    if (data.emcfDateTime) parts.push(`Date DGI: ${String(data.emcfDateTime)}`);
    const line = parts.join('  •  ');
    if (line) doc.text(line, 15, Math.min(secY, footerBottomY - 2));
    doc.setFont('helvetica', 'normal');
  }

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
