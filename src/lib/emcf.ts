export type EmcfPointOfSaleSummary = {
  id: string;
  name: string;
  baseUrl: string;
  hasToken: boolean;
  tokenEncrypted: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
};

type EmcfOptions = { posId?: string | null };

const isElectronEmcfAvailable = () => typeof window !== 'undefined' && !!(window as unknown as Window).electronAPI?.emcf;

export const emcf = {
  isAvailable: isElectronEmcfAvailable,

  async listPointsOfSale() {
    if (!isElectronEmcfAvailable()) throw new Error('e-MCF API not available');
    return (window as unknown as Window).electronAPI!.emcf!.listPointsOfSale();
  },

  async upsertPointOfSale(pos: { id: string; name: string; baseUrl: string; token?: string | null }) {
    if (!isElectronEmcfAvailable()) throw new Error('e-MCF API not available');
    return (window as unknown as Window).electronAPI!.emcf!.upsertPointOfSale(pos);
  },

  async deletePointOfSale(id: string) {
    if (!isElectronEmcfAvailable()) throw new Error('e-MCF API not available');
    return (window as unknown as Window).electronAPI!.emcf!.deletePointOfSale(id);
  },

  async setActivePointOfSale(id: string) {
    if (!isElectronEmcfAvailable()) throw new Error('e-MCF API not available');
    return (window as unknown as Window).electronAPI!.emcf!.setActivePointOfSale(id);
  },

  async getActivePointOfSale() {
    if (!isElectronEmcfAvailable()) throw new Error('e-MCF API not available');
    return (window as unknown as Window).electronAPI!.emcf!.getActivePointOfSale();
  },

  async status(options?: EmcfOptions) {
    if (!isElectronEmcfAvailable()) throw new Error('e-MCF API not available');
    return (window as unknown as Window).electronAPI!.emcf!.status(options);
  },

  async submitInvoice(payload: unknown, options?: EmcfOptions) {
    if (!isElectronEmcfAvailable()) throw new Error('e-MCF API not available');
    return (window as unknown as Window).electronAPI!.emcf!.submitInvoice(payload, options);
  },

  async confirmInvoice(uid: string, options?: EmcfOptions) {
    if (!isElectronEmcfAvailable()) throw new Error('e-MCF API not available');
    return (window as unknown as Window).electronAPI!.emcf!.confirmInvoice(uid, options);
  },

  async finalizeInvoice(uid: string, action: 'confirm' | 'cancel', options?: EmcfOptions) {
    if (!isElectronEmcfAvailable()) throw new Error('e-MCF API not available');
    return (window as unknown as Window).electronAPI!.emcf!.finalizeInvoice(uid, action, options);
  },

  async getInvoice(uid: string, options?: EmcfOptions) {
    if (!isElectronEmcfAvailable()) throw new Error('e-MCF API not available');
    return (window as unknown as Window).electronAPI!.emcf!.getInvoice(uid, options);
  },
};

export default emcf;
