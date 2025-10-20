export {};

declare global {
  // NOTE: model interfaces are defined in `src/lib/storage.ts`. To avoid
  // type collisions between ambient global interfaces and module types,
  // we intentionally do not redeclare Product/Client/Sale/Invoice here.

  interface UserInfo {
    id: string;
    username: string;
    role: string;
  }

  interface ElectronDBAPI {
    // Use `any` here to avoid tight coupling with module types in the renderer.
  getProducts: () => Promise<unknown[]>;
  getClients: () => Promise<unknown[]>;
  getSales: () => Promise<unknown[]>;
  getInvoices: () => Promise<unknown[]>;
    getUserByUsername: (username: string) => Promise<UserInfo | null>;
    getNextInvoiceNumber: () => Promise<string>;
    // Optional helper exposed by preload/main to reset demo data (desktop only)
    resetDemoData?: () => Promise<boolean>;
    // Optional CRUD methods (desktop main may expose these)
    addProduct?: (...args: unknown[]) => Promise<unknown>;
    updateProduct?: (...args: unknown[]) => Promise<void>;
    deleteProduct?: (...args: unknown[]) => Promise<void>;
    addClient?: (...args: unknown[]) => Promise<unknown>;
    updateClient?: (...args: unknown[]) => Promise<void>;
    deleteClient?: (...args: unknown[]) => Promise<void>;
    addSale?: (...args: unknown[]) => Promise<unknown>;
    addInvoice?: (...args: unknown[]) => Promise<unknown>;
  // Categories
  getCategories?: () => Promise<unknown[]>;
  addCategory?: (...args: unknown[]) => Promise<unknown>;
  updateCategory?: (...args: unknown[]) => Promise<unknown>;
  deleteCategory?: (...args: unknown[]) => Promise<void>;
  // Backup and restore (desktop-only)
  backupDatabase?: () => Promise<{ success: boolean; path?: string; error?: string }>;
  restoreDatabase?: (backupPath: string) => Promise<{ success: boolean; error?: string }>;
  // List backups and audit logging
  listBackups?: () => Promise<unknown[]>;
  listAudits?: () => Promise<Array<Record<string, unknown>>>;
  addAudit?: (action: string, entity: string, entityId?: string, userId?: string, meta?: unknown) => Promise<boolean>;
  // User management
  getUsers?: () => Promise<Array<{ id: string; username: string; role: string; created_at: string }>>;
  addUser?: (user: { id: string; username: string; password?: string; role?: string }) => Promise<unknown>;
  updateUser?: (id: string, updates: Partial<{ username: string; password?: string; role?: string }>) => Promise<unknown>;
  deleteUser?: (id: string) => Promise<unknown>;
  // Atomic sale+invoice and invoice operations
  createSaleWithInvoice?: (...args: unknown[]) => Promise<unknown>;
  updateInvoice?: (...args: unknown[]) => Promise<unknown>;
  deleteInvoice?: (...args: unknown[]) => Promise<unknown>;
  // Stock movements
  getStockMovements?: () => Promise<unknown[]>;
  addStockMovement?: (...args: unknown[]) => Promise<unknown>;
  }

  interface ElectronAuthAPI {
    login: (username: string, password: string) => Promise<{ success: boolean; user?: { id: string; username: string; role: string } }>;
  }

  interface Window {
    electronAPI?: {
      db?: ElectronDBAPI;
      auth?: ElectronAuthAPI;
    };
  }
}
