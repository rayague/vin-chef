/*
  db.ts
  Database adapter for vin-chef

  Behavior:
  - If running under Electron with preload exposing `window.electronAPI.db`, use that IPC API.
  - Otherwise, use an IndexedDB-backed fallback (via a tiny key-value layer) with localStorage fallback for simple demo reset.

  Exports mirror the preload API used elsewhere: getProducts, getClients, getSales, getInvoices, getUserByUsername, getNextInvoiceNumber, resetDemoData
*/

// idb is optional. We dynamically import it only when needed so the dev server
// doesn't fail if the package isn't installed. When it's missing we fall back
// to the localStorage-based `storage` helpers.
import {
  Product as StorageProduct,
  Client as StorageClient,
  Sale as StorageSale,
  Invoice as StorageInvoice,
  getProducts as storageGetProducts,
  getClients as storageGetClients,
  getSales as storageGetSales,
  getInvoices as storageGetInvoices,
  getUserByUsername as storageGetUserByUsername,
  initializeDemoData,
  getNextInvoiceNumber as storageGetNextInvoiceNumber,
  addProduct as storageAddProduct,
  updateProduct as storageUpdateProduct,
  deleteProduct as storageDeleteProduct,
  addClient as storageAddClient,
  updateClient as storageUpdateClient,
  deleteClient as storageDeleteClient,
  addSale as storageAddSale,
  addInvoice as storageAddInvoice,
  getCategories as storageGetCategories,
  addCategory as storageAddCategory,
  updateCategory as storageUpdateCategory,
  deleteCategory as storageDeleteCategory,
} from './storage';
import * as idb from './indexeddb';

// Minimal IndexedDB wrapper using idb
const DB_NAME = 'vin-chef-db';
const DB_VERSION = 1;

async function openAppDB() {
  // Try to load `idb` dynamically. If unavailable, return null so callers
  // can fall back to the synchronous `storage` helpers.
  // For now we don't attempt to open an IndexedDB instance here. The app
  // prefers the Electron IPC when available, otherwise falls back to the
  // synchronous `storage` helpers. Keeping this stub avoids referencing the
  // optional `idb` package and prevents module resolution errors in dev.
  return null;
}

const isElectronDBAvailable = () => typeof window !== 'undefined' && !!(window as unknown as Window).electronAPI?.db;

// Local storage user shape for fallback operations
type StorageUser = { id: string; username: string; passwordHash?: string; role: string; email?: string; phone?: string };

export const db = {
  async getProducts() {
    if (isElectronDBAvailable()) {
      const res = await (window as unknown as Window).electronAPI!.db!.getProducts();
      return res as StorageProduct[];
    }
    // try IndexedDB first, then localStorage
    try {
      const items = await idb.idbGetAll<StorageProduct>('products');
      if (items && items.length > 0) return items;
    } catch (e) {
      // ignore
    }
    return storageGetProducts();
  },

  async addProduct(product: StorageProduct) {
    if (isElectronDBAvailable() && (window as unknown as Window).electronAPI!.db!.addProduct) {
      return (window as unknown as Window).electronAPI!.db!.addProduct(product);
    }
    try {
      await idb.idbPut('products', product);
      return product;
    } catch (e) {
      return storageAddProduct(product);
    }
  },
  async updateProduct(id: string, updates: Partial<StorageProduct>) {
    if (isElectronDBAvailable() && (window as unknown as Window).electronAPI!.db!.updateProduct) {
      return (window as unknown as Window).electronAPI!.db!.updateProduct(id, updates);
    }
    try {
      const existing = await idb.idbGet<StorageProduct>('products', id);
      if (!existing) return null;
      const updated = { ...existing, ...updates } as StorageProduct;
      await idb.idbPut('products', updated);
      return updated;
    } catch (e) {
      return storageUpdateProduct(id, updates);
    }
  },

  async deleteProduct(id: string) {
    if (isElectronDBAvailable() && (window as unknown as Window).electronAPI!.db!.deleteProduct) {
      return (window as unknown as Window).electronAPI!.db!.deleteProduct(id);
    }
    try {
      await idb.idbDelete('products', id);
      return true;
    } catch (e) {
      return storageDeleteProduct(id);
    }
  },

  async getClients() {
    if (isElectronDBAvailable()) {
      const res = await (window as unknown as Window).electronAPI!.db!.getClients();
      return res as StorageClient[];
    }
    try {
      const items = await idb.idbGetAll<StorageClient>('clients');
      if (items && items.length > 0) return items;
    } catch (e) {
      // ignore
    }
    return storageGetClients();
  },

  async getCategories() {
    if (isElectronDBAvailable()) {
      const res = await (window as unknown as Window).electronAPI!.db!.getCategories();
      return res as { id: string; name: string; description?: string }[];
    }
    try {
      const items = await idb.idbGetAll<{ id: string; name: string; description?: string }>('categories');
      if (items && items.length > 0) return items;
    } catch (e) {
      // ignore
    }
    // fallback to storage
    return storageGetCategories();
  },

  async addCategory(category: { id: string; name: string; description?: string }) {
    if (isElectronDBAvailable() && (window as unknown as Window).electronAPI!.db!.addCategory) {
      return (window as unknown as Window).electronAPI!.db!.addCategory(category);
    }
    try {
      await idb.idbPut('categories', category);
      return category;
    } catch (e) {
      return storageAddCategory(category);
    }
  },

  async updateCategory(id: string, updates: Partial<{ id: string; name: string; description?: string }>) {
    if (isElectronDBAvailable() && (window as unknown as Window).electronAPI!.db!.updateCategory) {
      return (window as unknown as Window).electronAPI!.db!.updateCategory(id, updates);
    }
    try {
      const existing = await idb.idbGet<{ id: string; name: string; description?: string }>('categories', id);
      if (!existing) return null;
      const updated = { ...existing, ...updates } as { id: string; name: string; description?: string };
      await idb.idbPut('categories', updated);
      return updated;
    } catch (e) {
      return storageUpdateCategory(id, updates);
    }
  },

  async deleteCategory(id: string) {
    if (isElectronDBAvailable() && (window as unknown as Window).electronAPI!.db!.deleteCategory) {
      return (window as unknown as Window).electronAPI!.db!.deleteCategory(id);
    }
    try {
      await idb.idbDelete('categories', id);
      return true;
    } catch (e) {
      return storageDeleteCategory(id);
    }
  },

  async addClient(client: StorageClient) {
    if (isElectronDBAvailable() && (window as unknown as Window).electronAPI!.db!.addClient) {
      return (window as unknown as Window).electronAPI!.db!.addClient(client);
    }
    try {
      await idb.idbPut('clients', client);
      return client;
    } catch (e) {
      return storageAddClient(client);
    }
  },

  async updateClient(id: string, updates: Partial<StorageClient>) {
    if (isElectronDBAvailable() && (window as unknown as Window).electronAPI!.db!.updateClient) {
      return (window as unknown as Window).electronAPI!.db!.updateClient(id, updates);
    }
  try {
    const existing = await idb.idbGet<StorageClient>('clients', id);
    if (!existing) return null;
    const updated = { ...existing, ...updates } as StorageClient;
    await idb.idbPut('clients', updated);
    return updated;
  } catch (e) {
    return storageUpdateClient(id, updates);
  }
  },

  async deleteClient(id: string) {
    if (isElectronDBAvailable() && (window as unknown as Window).electronAPI!.db!.deleteClient) {
      return (window as unknown as Window).electronAPI!.db!.deleteClient(id);
    }
    try {
      await idb.idbDelete('clients', id);
      return true;
    } catch (e) {
      return storageDeleteClient(id);
    }
  },

  async getSales() {
    if (isElectronDBAvailable()) {
      const res = await (window as unknown as Window).electronAPI!.db!.getSales();
      return res as StorageSale[];
    }
    try {
      const items = await idb.idbGetAll<StorageSale>('sales');
      if (items && items.length > 0) return items;
    } catch (e) {
      // ignore
    }
    return storageGetSales();
  },

  async addSale(sale: StorageSale) {
    if (isElectronDBAvailable()) {
      const api = (window as unknown as Window).electronAPI!.db as unknown as ElectronDBAPI | undefined;
      if (api && typeof api.addSale === 'function') {
        const res = await api.addSale(sale);
        try {
          if (typeof api.addAudit === 'function') await api.addAudit('create', 'sale', sale.id, undefined, { sale });
        } catch (err) {
          console.error('Failed to write audit (addSale electron)', err);
        }
        return res as StorageSale;
      }
    }
    try {
      await idb.idbPut('sales', sale);
      // decrement product stock in idb if present
      try {
        const prod = await idb.idbGet<StorageProduct>('products', sale.productId);
        if (prod) {
          prod.stockQuantity = (prod.stockQuantity || 0) - sale.quantity;
          await idb.idbPut('products', prod);
        }
      } catch (err) {
        // ignore
      }
      try {
        await idb.idbPut('sales', sale);
        // write audit in fallback storage if available
        try {
          const s = await import('./storage');
          if (typeof s.addAudit === 'function') s.addAudit({ action: 'create', entity: 'sale', entityId: sale.id, meta: { sale } });
        } catch (err) {
          console.error('Failed to write audit (addSale fallback)', err);
        }
      } catch (e) {
        return storageAddSale(sale);
      }
      return sale;
    } catch (e) {
      return storageAddSale(sale);
    }
  },

  async getInvoices() {
    if (isElectronDBAvailable()) {
      const res = await (window as unknown as Window).electronAPI!.db!.getInvoices();
      return res as StorageInvoice[];
    }
    try {
      const items = await idb.idbGetAll<StorageInvoice>('invoices');
      if (items && items.length > 0) return items;
    } catch (e) {
      // ignore
    }
    return storageGetInvoices();
  },

  async addInvoice(invoice: StorageInvoice) {
    if (isElectronDBAvailable()) {
      const api = (window as unknown as Window).electronAPI!.db as unknown as ElectronDBAPI | undefined;
      if (api && typeof api.addInvoice === 'function') {
        const res = await api.addInvoice(invoice);
        try {
          if (typeof api.addAudit === 'function') await api.addAudit('create', 'invoice', invoice.id, undefined, { invoice });
        } catch (err) {
          console.error('Failed to write audit (addInvoice electron)', err);
        }
        return res as StorageInvoice;
      }
    }
    try {
      await idb.idbPut('invoices', invoice);
      try {
        const s = await import('./storage');
        if (typeof s.addAudit === 'function') s.addAudit({ action: 'create', entity: 'invoice', entityId: invoice.id, meta: { invoice } });
      } catch (err) {
        console.error('Failed to write audit (addInvoice fallback)', err);
      }
      return invoice;
    } catch (e) {
      return storageAddInvoice(invoice);
    }
  },

  // Atomic sale + invoice (desktop): fallback to sequential when not available
  async createSaleWithInvoice(sale: StorageSale, invoice: StorageInvoice) {
    if (isElectronDBAvailable()) {
      const api = (window as unknown as Window).electronAPI!.db as unknown as ElectronDBAPI | undefined;
      if (api && typeof api.createSaleWithInvoice === 'function') {
        const res = await api.createSaleWithInvoice(sale, invoice);
        try {
          if (typeof api.addAudit === 'function') await api.addAudit('create', 'sale', sale.id, undefined, { sale, invoice });
        } catch (err) {
          console.error('Failed to write audit (createSaleWithInvoice electron)', err);
        }
        return res;
      }
    }
    // fallback: try sequential and hope for best
    const s = await this.addSale(sale);
    const inv = await this.addInvoice(invoice);
    try {
      // attempt to write a combined audit in fallback
      const st = await import('./storage');
      if (typeof st.addAudit === 'function') st.addAudit({ action: 'create', entity: 'sale', entityId: sale.id, meta: { sale, invoice } });
    } catch (err) {
      console.error('Failed to write audit (createSaleWithInvoice fallback)', err);
    }
    return { sale: s, invoice: inv };
  },

  async updateInvoice(id: string, updates: Partial<StorageInvoice>) {
    if (isElectronDBAvailable() && (window as unknown as Window).electronAPI!.db!.updateInvoice) {
      return (window as unknown as Window).electronAPI!.db!.updateInvoice(id, updates);
    }
    // no-op fallback: try IndexedDB/storage
    try {
      const existing = await idb.idbGet<StorageInvoice>('invoices', id);
      if (!existing) return null;
      // check common flag names
  const ex = existing as unknown as Record<string, unknown>;
  const isImmutable = ex['immutable_flag'] === 1 || ex['immutableFlag'] === true;
      if (isImmutable) throw new Error('Invoice is immutable');
      const updated = { ...existing, ...updates } as StorageInvoice;
      await idb.idbPut('invoices', updated);
      return updated;
    } catch (e) {
      return null;
    }
  },

  async deleteInvoice(id: string) {
    if (isElectronDBAvailable() && (window as unknown as Window).electronAPI!.db!.deleteInvoice) {
      return (window as unknown as Window).electronAPI!.db!.deleteInvoice(id);
    }
    try {
      await idb.idbDelete('invoices', id);
      return true;
    } catch (e) {
      return false;
    }
  },

  async getUserByUsername(username: string) {
  if (isElectronDBAvailable()) return (window as unknown as Window).electronAPI!.db!.getUserByUsername(username);
    return storageGetUserByUsername(username) || null;
  },

  async getUsers() {
    if (isElectronDBAvailable()) {
      const res = await (window as unknown as Window).electronAPI!.db!.getUsers();
      return res as Array<{ id: string; username: string; role: string; created_at: string }>;
    }
    // fallback to storage
    try {
      const s = await import('./storage');
      return s.getUsers ? (s.getUsers() as StorageUser[]) : [];
    } catch (e) {
      return [] as Array<{ id: string; username: string; role: string; created_at: string }>;
    }
  },

  async addUser(user: { id: string; username: string; password?: string; role?: string }) {
    if (isElectronDBAvailable()) {
      const api = (window as unknown as Window).electronAPI!.db as unknown as ElectronDBAPI | undefined;
      if (api && typeof api.addUser === 'function') {
        const res = await api.addUser(user);
        try {
          if (typeof api.addAudit === 'function') {
            const newId = ((res as unknown) as { id?: string })?.id || user.id;
            await api.addAudit('create', 'user', newId, undefined, { username: user.username });
          }
        } catch (e) {
          console.error('Failed to write audit (create user)', e);
        }
        return res;
      }
    }
    // fallback to storage
    try {
      const s = await import('./storage');
      const bcrypt = await import('bcryptjs');
      const u: StorageUser = { id: user.id, username: user.username, passwordHash: bcrypt.hashSync(user.password || 'changeme', 10), role: user.role || 'commercial' };
      if (typeof s.addUser === 'function') {
        s.addUser(u as unknown as Partial<import('./storage').User>);
      }
      try {
        if (typeof s.addAudit === 'function') s.addAudit({ action: 'create', entity: 'user', entityId: u.id, meta: { username: u.username } });
      } catch (err) {
        console.error('Failed to write audit (create user) fallback', err);
      }
      return u;
    } catch (e) {
      throw new Error('addUser not supported in this environment');
    }
  },

  async updateUser(id: string, updates: Partial<{ username: string; password?: string; role?: string }>) {
    if (isElectronDBAvailable()) {
      const api = (window as unknown as Window).electronAPI!.db as unknown as ElectronDBAPI | undefined;
      if (api && typeof api.updateUser === 'function') {
        const res = await api.updateUser(id, updates);
        try {
          if (typeof api.addAudit === 'function') await api.addAudit('update', 'user', id, undefined, { updates });
        } catch (e) {
          console.error('Failed to write audit (update user)', e);
        }
        return res;
      }
    }
    try {
      const s = await import('./storage');
      const bcrypt = await import('bcryptjs');
      const uUpdates: Partial<StorageUser> = {};
      if (updates.username) uUpdates.username = updates.username;
      if (updates.role) uUpdates.role = updates.role;
      if (updates.password) uUpdates.passwordHash = bcrypt.hashSync(updates.password, 10);
      if (typeof s.updateUser === 'function') {
  s.updateUser(id, uUpdates as unknown as Partial<StorageUser>);
      }
      const users = s.getUsers ? (s.getUsers() as StorageUser[]) : [];
      try {
        if (typeof s.addAudit === 'function') s.addAudit({ action: 'update', entity: 'user', entityId: id, meta: { updates } });
      } catch (err) {
        console.error('Failed to write audit (update user) fallback', err);
      }
      return users.find(x => x.id === id) || null;
    } catch (e) {
      throw new Error('updateUser not supported in this environment');
    }
  },

  async deleteUser(id: string) {
    if (isElectronDBAvailable()) {
      const api = (window as unknown as Window).electronAPI!.db as unknown as ElectronDBAPI | undefined;
      if (api && typeof api.deleteUser === 'function') {
        const res = await api.deleteUser(id);
        try {
          if (typeof api.addAudit === 'function') await api.addAudit('delete', 'user', id, undefined, null);
        } catch (e) {
          console.error('Failed to write audit (delete user)', e);
        }
        return res;
      }
    }
    try {
  const s = await import('./storage');
  if (typeof s.deleteUser === 'function') s.deleteUser(id);
  try {
    if (typeof s.addAudit === 'function') s.addAudit({ action: 'delete', entity: 'user', entityId: id });
  } catch (err) {
    console.error('Failed to write audit (delete user) fallback', err);
  }
  return true;
    } catch (e) {
      throw new Error('deleteUser not supported in this environment');
    }
  },

  async getNextInvoiceNumber() {
  if (isElectronDBAvailable()) return (window as unknown as Window).electronAPI!.db!.getNextInvoiceNumber();
    try {
      return await idb.idbGetNextInvoiceNumber();
    } catch (e) {
      return storageGetNextInvoiceNumber();
    }
  },

  // Reset demo data (desktop only in preload) - fallback: reinitialize localStorage demo data
  async resetDemoData() {
  if (isElectronDBAvailable() && (window as unknown as Window).electronAPI?.db?.resetDemoData) return (window as unknown as Window).electronAPI!.db!.resetDemoData();
    try {
      // Try to clear IndexedDB stores first
      try {
        await idb.idbResetDemoData(initializeDemoData);
      } catch (err) {
        // fallback to storage initializer
        initializeDemoData(true);
      }
      return true;
    } catch (err) {
      console.error('db.resetDemoData fallback failed', err);
      return false;
    }
  },

  // Desktop-only: backup current SQLite DB to a timestamped file, return { success, path }
  async backupDatabase() {
    if (isElectronDBAvailable()) {
      const api = (window as unknown as Window).electronAPI?.db as unknown as ElectronDBAPI | undefined;
      if (api && typeof api.backupDatabase === 'function') return api.backupDatabase();
    }
    return { success: false, error: 'not available' };
  },

  // Desktop-only: restore DB from given backup path. Returns { success }
  async restoreDatabase(backupPath: string) {
    if (isElectronDBAvailable()) {
      const api = (window as unknown as Window).electronAPI?.db as unknown as ElectronDBAPI | undefined;
      if (api && typeof api.restoreDatabase === 'function') return api.restoreDatabase(backupPath);
    }
    return { success: false, error: 'not available' };
  },
  async listBackups() {
    if (isElectronDBAvailable()) {
      const api = (window as unknown as Window).electronAPI?.db as unknown as ElectronDBAPI | undefined;
      if (api && typeof api.listBackups === 'function') return api.listBackups();
    }
    return [];
  },

  async addAudit(action: string, entity: string, entityId?: string, userId?: string, meta?: unknown) {
    if (isElectronDBAvailable()) {
      const api = (window as unknown as Window).electronAPI?.db as unknown as ElectronDBAPI | undefined;
      if (api && typeof api.addAudit === 'function') return api.addAudit(action, entity, entityId, userId, meta);
    }
    return false;
  },
  async listAudits(): Promise<Array<Record<string, unknown>>> {
    if (isElectronDBAvailable()) {
      const api = (window as unknown as Window).electronAPI?.db as unknown as ElectronDBAPI | undefined;
      if (api && typeof api.listAudits === 'function') return api.listAudits() as Promise<Array<Record<string, unknown>>>;
    }
    return [] as Array<Record<string, unknown>>;
  },
};

export default db;
