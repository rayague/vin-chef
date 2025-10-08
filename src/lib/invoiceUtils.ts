import { Invoice } from './storage';

export type InvoiceFilterOptions = {
  search?: string;
  fromDate?: string;
  toDate?: string;
};

export function filterInvoices(invoices: Invoice[], opts: InvoiceFilterOptions = {}) {
  const { search = '', fromDate, toDate } = opts;
  const q = String(search || '').trim().toLowerCase();

  return invoices.filter(inv => {
    const invDate = new Date(inv.date);
    if (fromDate) {
      const f = new Date(fromDate + 'T00:00:00');
      if (invDate < f) return false;
    }
    if (toDate) {
      const t = new Date(toDate + 'T23:59:59');
      if (invDate > t) return false;
    }

    if (!q) return true;
    return (
      inv.invoiceNumber.toLowerCase().includes(q) ||
      inv.clientName.toLowerCase().includes(q) ||
      inv.productName.toLowerCase().includes(q)
    );
  });
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  const end = currentPage * pageSize;
  return {
    total,
    totalPages,
    currentPage,
    items: items.slice(start, end),
  };
}

export default { filterInvoices, paginate };
