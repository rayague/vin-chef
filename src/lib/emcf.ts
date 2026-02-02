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

declare global {
  interface Window {
    electronAPI?: {
      emcf?: {
        listPointsOfSale: () => Promise<EmcfPointOfSaleSummary[]>;
        upsertPointOfSale: (pos: { id: string; name: string; baseUrl: string; token?: string | null }) => Promise<unknown>;
        deletePointOfSale: (id: string) => Promise<boolean>;
        setActivePointOfSale: (id: string) => Promise<boolean>;
        getActivePointOfSale: () => Promise<EmcfPointOfSaleSummary | null>;
        submitInvoice: (payload: unknown, options?: EmcfOptions) => Promise<unknown>;
        finalizeInvoice: (uid: string, action: string, options?: EmcfOptions) => Promise<unknown>;
        confirmInvoice: (uid: string, options?: EmcfOptions) => Promise<unknown>;
        getInvoice: (uid: string, options?: EmcfOptions) => Promise<unknown>;
        status: (options?: EmcfOptions) => Promise<unknown>;
      };
    };
  }
}

const isElectronEmcfAvailable = () => typeof window !== 'undefined' && !!window.electronAPI?.emcf;

export const emcf = {
  isAvailable: isElectronEmcfAvailable,

  async listPointsOfSale() {
    if (!isElectronEmcfAvailable()) throw new Error('e-MCF API not available');
    return window.electronAPI!.emcf!.listPointsOfSale();
  },

  async upsertPointOfSale(pos: { id: string; name: string; baseUrl: string; token?: string | null }) {
    if (!isElectronEmcfAvailable()) throw new Error('e-MCF API not available');
    return window.electronAPI!.emcf!.upsertPointOfSale(pos);
  },

  async deletePointOfSale(id: string) {
    if (!isElectronEmcfAvailable()) throw new Error('e-MCF API not available');
    return window.electronAPI!.emcf!.deletePointOfSale(id);
  },

  async setActivePointOfSale(id: string) {
    if (!isElectronEmcfAvailable()) throw new Error('e-MCF API not available');
    return window.electronAPI!.emcf!.setActivePointOfSale(id);
  },

  async getActivePointOfSale() {
    if (!isElectronEmcfAvailable()) throw new Error('e-MCF API not available');
    return window.electronAPI!.emcf!.getActivePointOfSale();
  },

  async status(options?: EmcfOptions) {
    if (!isElectronEmcfAvailable()) throw new Error('e-MCF API not available');
    return window.electronAPI!.emcf!.status(options);
  },

  async submitInvoice(payload: unknown, options?: EmcfOptions) {
    if (!isElectronEmcfAvailable()) throw new Error('e-MCF API not available');
    return window.electronAPI!.emcf!.submitInvoice(payload, options);
  },

  async confirmInvoice(uid: string, options?: EmcfOptions) {
    if (!isElectronEmcfAvailable()) throw new Error('e-MCF API not available');
    return window.electronAPI!.emcf!.confirmInvoice(uid, options);
  },

  async finalizeInvoice(uid: string, action: 'confirm' | 'cancel', options?: EmcfOptions) {
    if (!isElectronEmcfAvailable()) throw new Error('e-MCF API not available');
    return window.electronAPI!.emcf!.finalizeInvoice(uid, action, options);
  },

  async getInvoice(uid: string, options?: EmcfOptions) {
    if (!isElectronEmcfAvailable()) throw new Error('e-MCF API not available');
    return window.electronAPI!.emcf!.getInvoice(uid, options);
  },
};

export default emcf;
