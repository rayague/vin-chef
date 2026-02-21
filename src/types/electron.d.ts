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

  interface ElectronUpdaterAPI {
    checkForUpdates: () => Promise<{ success: boolean; result?: unknown; error?: string }>;
    quitAndInstall: () => Promise<{ success: boolean; error?: string }>;
    onStatus: (cb: (payload: unknown) => void) => () => void;
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
    resetProductCatalog?: () => Promise<boolean>;
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
  getDatabaseInfo?: () => Promise<{ success: boolean; exists?: boolean; path?: string; sizeBytes?: number; mtimeIso?: string | null; backupsCount?: number; error?: string }>;
  exportDatabaseAs?: () => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
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
  addStockMovement?: (movement: { id: string; productId: string; type: string; quantity: number; reason?: string; date: string; createdBy?: string; previousStock: number; newStock: number }) => Promise<unknown>;
  }

  interface ElectronAuthAPI {
    login: (username: string, password: string) => Promise<{ success: boolean; user?: { id: string; username: string; role: string } }>;
  }

  interface EmcfPointOfSaleSummary {
    id: string;
    name: string;
    baseUrl: string;
    hasToken: boolean;
    tokenEncrypted: boolean;
    isActive: boolean;
    createdAt: string;
    updatedAt: string | null;
  }

  interface ElectronEmcfAPI {
    listPointsOfSale: () => Promise<EmcfPointOfSaleSummary[]>;
    upsertPointOfSale: (pos: { id: string; name: string; baseUrl: string; token?: string | null }) => Promise<unknown>;
    deletePointOfSale: (id: string) => Promise<boolean>;
    setActivePointOfSale: (id: string) => Promise<boolean>;
    getActivePointOfSale: () => Promise<EmcfPointOfSaleSummary | null>;
    submitInvoice: (payload: unknown, options?: { posId?: string | null }) => Promise<unknown>;
    finalizeInvoice: (uid: string, action: string, options?: { posId?: string | null }) => Promise<unknown>;
    confirmInvoice: (uid: string, options?: { posId?: string | null }) => Promise<unknown>;
    getInvoice: (uid: string, options?: { posId?: string | null }) => Promise<unknown>;
    status: (options?: { posId?: string | null }) => Promise<unknown>;
  }

  interface Window {
    electronAPI?: {
      updater?: ElectronUpdaterAPI;
      db?: ElectronDBAPI;
      emcf?: ElectronEmcfAPI;
      auth?: ElectronAuthAPI;
    };
  }
}
