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
  productName: string;
  quantity: number;
  unitPrice: number;
  totalHT: number;
  tva: number;
  totalTTC: number;
}

// Company info (configurable)
const COMPANY_INFO = {
  name: 'Cave Premium Wines',
  address: 'Avenue de la République, Cotonou',
  city: 'Cotonou, Bénin',
  phone: '+229 21 00 00 00',
  email: 'contact@cavepremium.bj',
  ifu: '0123456789012', // IFU (Identifiant Fiscal Unique) - Bénin
};

export const generateInvoicePDF = (data: InvoiceData): jsPDF => {
  const doc = new jsPDF();
  
  // Colors
  const burgundy: [number, number, number] = [128, 24, 24];
  const gold: [number, number, number] = [218, 165, 32];
  
  // Header with company logo area
  doc.setFillColor(...burgundy);
  doc.rect(0, 0, 210, 40, 'F');
  
  // Company name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text(COMPANY_INFO.name, 20, 20);
  
  // Company details
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(COMPANY_INFO.address, 20, 28);
  doc.text(`${COMPANY_INFO.city} | ${COMPANY_INFO.phone}`, 20, 33);
  doc.text(`IFU: ${COMPANY_INFO.ifu}`, 20, 38);
  
  // FACTURE title
  doc.setFillColor(...gold);
  doc.rect(140, 10, 50, 15, 'F');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('FACTURE', 145, 20);
  
  // Invoice details
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`N° ${data.invoiceNumber}`, 145, 28);
  doc.text(`Date: ${format(new Date(data.date), 'dd/MM/yyyy', { locale: fr })}`, 145, 33);
  
  // Client info
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Client:', 20, 55);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(data.clientName, 20, 62);
  if (data.clientAddress) {
    doc.text(data.clientAddress, 20, 67);
  }
  if (data.clientPhone) {
    doc.text(`Tél: ${data.clientPhone}`, 20, 72);
  }
  
  // Products table
  const tableStartY = 85;
  
  autoTable(doc, {
    startY: tableStartY,
    head: [['Désignation', 'Quantité', 'Prix Unitaire', 'Total HT']],
    body: [
      [
        data.productName,
        data.quantity.toString(),
        `${data.unitPrice.toLocaleString('fr-FR')} FCFA`,
        `${data.totalHT.toLocaleString('fr-FR')} FCFA`,
      ],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: burgundy,
      textColor: [255, 255, 255],
      fontSize: 11,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 10,
    },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 30, halign: 'center' },
      2: { cellWidth: 40, halign: 'right' },
      3: { cellWidth: 40, halign: 'right' },
    },
  });
  
  // Calculate final Y position after table
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  
  // Totals section
  const totalsX = 130;
  let currentY = finalY;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  // Total HT
  doc.text('Total HT:', totalsX, currentY);
  doc.text(`${data.totalHT.toLocaleString('fr-FR')} FCFA`, 190, currentY, { align: 'right' });
  currentY += 7;
  
  // TVA (18% au Bénin)
  doc.text(`TVA (18%):`, totalsX, currentY);
  doc.text(`${data.tva.toLocaleString('fr-FR')} FCFA`, 190, currentY, { align: 'right' });
  currentY += 10;
  
  // Total TTC
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(...gold);
  doc.rect(totalsX - 5, currentY - 6, 65, 10, 'F');
  doc.text('Total TTC:', totalsX, currentY);
  doc.text(`${data.totalTTC.toLocaleString('fr-FR')} FCFA`, 190, currentY, { align: 'right' });
  
  // Footer
  const footerY = 270;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 100, 100);
  doc.text('Merci de votre confiance', 105, footerY, { align: 'center' });
  doc.text(`${COMPANY_INFO.email} | ${COMPANY_INFO.phone}`, 105, footerY + 5, { align: 'center' });
  
  // Payment conditions
  doc.setFontSize(7);
  doc.text('Conditions de paiement: Comptant - Pas d\'escompte en cas de paiement anticipé', 20, footerY + 15);
  doc.text('En cas de retard de paiement, une pénalité de 3% du montant TTC sera appliquée', 20, footerY + 19);
  
  return doc;
};

export const downloadInvoice = (invoiceNumber: string, doc: jsPDF) => {
  const filename = `Facture_${invoiceNumber}_${format(new Date(), 'yyyyMMdd')}.pdf`;
  doc.save(filename);
};
