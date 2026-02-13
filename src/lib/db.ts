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
  seedWineCatalog,
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
import logger from './logger';
import bcrypt from 'bcryptjs';
import {
  getUsers as storageGetUsers,
  addUser as storageAddUser,
  updateUser as storageUpdateUser,
  deleteUser as storageDeleteUser,
  addAudit as storageAddAudit,
  getStockMovements as storageGetStockMovements,
  addStockMovement as storageAddStockMovement,
} from './storage';

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

function emitChange(detail: { entity: string; action: string; id?: string }) {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('vinchef:data-changed', { detail }));
    }
  } catch (e) {
    // ignore
  }
}

// Local storage user shape for fallback operations
type StorageUser = { id: string; username: string; passwordHash?: string; role: string; email?: string; phone?: string };

export const db = {
  async getProducts() {
    if (isElectronDBAvailable()) {
      const res = await (window as unknown as Window).electronAPI!.db!.getProducts();
      const list = (res as unknown as Array<Record<string, unknown>>) || [];
      return list.map((p) => {
        const unitPriceRaw = (p as { unitPrice?: unknown; unit_price?: unknown }).unitPrice ?? (p as { unit_price?: unknown }).unit_price;
        const stockQtyRaw = (p as { stockQuantity?: unknown; stock_quantity?: unknown }).stockQuantity ?? (p as { stock_quantity?: unknown }).stock_quantity;
        const taxGroupRaw = (p as { taxGroup?: unknown; tax_group?: unknown }).taxGroup ?? (p as { tax_group?: unknown }).tax_group;
        const tvaRateRaw = (p as { tvaRate?: unknown; tva_rate?: unknown }).tvaRate ?? (p as { tva_rate?: unknown }).tva_rate;
        const unitPrice = Number(unitPriceRaw);
        const stockQuantity = Number.parseInt(String(stockQtyRaw ?? ''), 10);
        const tvaRate = Number(tvaRateRaw);
        return {
          ...(p as unknown as StorageProduct),
          unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
          stockQuantity: Number.isFinite(stockQuantity) ? stockQuantity : 0,
          taxGroup: (typeof taxGroupRaw === 'string' ? taxGroupRaw : undefined) as StorageProduct['taxGroup'],
          tvaRate: Number.isFinite(tvaRate) ? tvaRate : undefined,
        } as StorageProduct;
      });
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
      const res = await (window as unknown as Window).electronAPI!.db!.addProduct(product);
      emitChange({ entity: 'products', action: 'add', id: product.id });
      return res;
    }
    try {
      await idb.idbPut('products', product);
      emitChange({ entity: 'products', action: 'add', id: product.id });
      return product;
    } catch (e) {
      const res = storageAddProduct(product);
      emitChange({ entity: 'products', action: 'add', id: product.id });
      return res;
    }
  },
  async updateProduct(id: string, updates: Partial<StorageProduct>) {
    if (isElectronDBAvailable() && (window as unknown as Window).electronAPI!.db!.updateProduct) {
      const res = await (window as unknown as Window).electronAPI!.db!.updateProduct(id, updates);
      emitChange({ entity: 'products', action: 'update', id });
      return res;
    }
    try {
      const existing = await idb.idbGet<StorageProduct>('products', id);
      if (!existing) throw new Error('Product not found in IndexedDB');
      const updated = { ...existing, ...updates } as StorageProduct;
      await idb.idbPut('products', updated);
      emitChange({ entity: 'products', action: 'update', id });
      return updated;
    } catch (e) {
      const res = storageUpdateProduct(id, updates);
      emitChange({ entity: 'products', action: 'update', id });
      return res;
    }
  },

  async deleteProduct(id: string) {
    if (isElectronDBAvailable() && (window as unknown as Window).electronAPI!.db!.deleteProduct) {
      const res = await (window as unknown as Window).electronAPI!.db!.deleteProduct(id);
      emitChange({ entity: 'products', action: 'delete', id });
      return res;
    }
    try {
      await idb.idbDelete('products', id);
      emitChange({ entity: 'products', action: 'delete', id });
      return true;
    } catch (e) {
      const res = storageDeleteProduct(id);
      emitChange({ entity: 'products', action: 'delete', id });
      return res;
    }
  },

  async getClients() {
    if (isElectronDBAvailable()) {
      const res = await (window as unknown as Window).electronAPI!.db!.getClients();
      const list = (res as unknown as Array<Record<string, unknown>>) || [];
      return list.map((c) => {
        const anyC = c as {
          contactInfo?: unknown;
          contact_info?: unknown;
          aibRegistration?: unknown;
          aib_registration?: unknown;
          aibRate?: unknown;
          aib_rate?: unknown;
          ifu?: unknown;
        };
        const aibRegistrationRaw = anyC.aibRegistration ?? anyC.aib_registration;
        const aibRateRaw = anyC.aibRate ?? anyC.aib_rate;
        const aibRateNum = Number(aibRateRaw);
        return {
          ...(c as unknown as StorageClient),
          contactInfo: String((anyC.contactInfo ?? anyC.contact_info ?? '') as string),
          ifu: typeof anyC.ifu === 'string' ? anyC.ifu : undefined,
          aibRegistration: Boolean(aibRegistrationRaw),
          aibRate: (aibRateNum === 0 || aibRateNum === 1 || aibRateNum === 5 ? aibRateNum : 0) as StorageClient['aibRate'],
        } as StorageClient;
      });
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
      const res = await (window as unknown as Window).electronAPI!.db!.addCategory(category);
      emitChange({ entity: 'categories', action: 'add', id: category.id });
      return res;
    }
    try {
      await idb.idbPut('categories', category);
      emitChange({ entity: 'categories', action: 'add', id: category.id });
      return category;
    } catch (e) {
      const res = storageAddCategory(category);
      emitChange({ entity: 'categories', action: 'add', id: category.id });
      return res;
    }
  },

  async updateCategory(id: string, updates: Partial<{ id: string; name: string; description?: string }>) {
    if (isElectronDBAvailable() && (window as unknown as Window).electronAPI!.db!.updateCategory) {
      const res = await (window as unknown as Window).electronAPI!.db!.updateCategory(id, updates);
      emitChange({ entity: 'categories', action: 'update', id });
      return res;
    }
    try {
      const existing = await idb.idbGet<{ id: string; name: string; description?: string }>('categories', id);
      if (!existing) return null;
      const updated = { ...existing, ...updates } as { id: string; name: string; description?: string };
      await idb.idbPut('categories', updated);
      emitChange({ entity: 'categories', action: 'update', id });
      return updated;
    } catch (e) {
      const res = storageUpdateCategory(id, updates);
      emitChange({ entity: 'categories', action: 'update', id });
      return res;
    }
  },

  async deleteCategory(id: string) {
    if (isElectronDBAvailable() && (window as unknown as Window).electronAPI!.db!.deleteCategory) {
      const res = await (window as unknown as Window).electronAPI!.db!.deleteCategory(id);
      emitChange({ entity: 'categories', action: 'delete', id });
      return res;
    }
    try {
      await idb.idbDelete('categories', id);
      emitChange({ entity: 'categories', action: 'delete', id });
      return true;
    } catch (e) {
      const res = storageDeleteCategory(id);
      emitChange({ entity: 'categories', action: 'delete', id });
      return res;
    }
  },

  async addClient(client: StorageClient) {
    if (isElectronDBAvailable() && (window as unknown as Window).electronAPI!.db!.addClient) {
      const res = await (window as unknown as Window).electronAPI!.db!.addClient(client);
      emitChange({ entity: 'clients', action: 'add', id: client.id });
      return res;
    }
    try {
      await idb.idbPut('clients', client);
      emitChange({ entity: 'clients', action: 'add', id: client.id });
      return client;
    } catch (e) {
      const res = storageAddClient(client);
      emitChange({ entity: 'clients', action: 'add', id: client.id });
      return res;
    }
  },

  async updateClient(id: string, updates: Partial<StorageClient>) {
    if (isElectronDBAvailable() && (window as unknown as Window).electronAPI!.db!.updateClient) {
      const res = await (window as unknown as Window).electronAPI!.db!.updateClient(id, updates);
      emitChange({ entity: 'clients', action: 'update', id });
      return res;
    }
  try {
    const existing = await idb.idbGet<StorageClient>('clients', id);
    if (!existing) return null;
    const updated = { ...existing, ...updates } as StorageClient;
    await idb.idbPut('clients', updated);
    emitChange({ entity: 'clients', action: 'update', id });
    return updated;
  } catch (e) {
    const res = storageUpdateClient(id, updates);
    emitChange({ entity: 'clients', action: 'update', id });
    return res;
  }
  },

  async deleteClient(id: string) {
    if (isElectronDBAvailable() && (window as unknown as Window).electronAPI!.db!.deleteClient) {
      const res = await (window as unknown as Window).electronAPI!.db!.deleteClient(id);
      emitChange({ entity: 'clients', action: 'delete', id });
      return res;
    }
    try {
      await idb.idbDelete('clients', id);
      emitChange({ entity: 'clients', action: 'delete', id });
      return true;
    } catch (e) {
      const res = storageDeleteClient(id);
      emitChange({ entity: 'clients', action: 'delete', id });
      return res;
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
        emitChange({ entity: 'sales', action: 'add', id: sale.id });
        try {
          const itemsArr = (sale as unknown as { items?: Array<{ productId: string; quantity: number }> }).items;
          if (itemsArr && itemsArr.length > 0) {
            for (const it of itemsArr) {
              if (it?.productId) emitChange({ entity: 'products', action: 'update', id: it.productId });
            }
          } else {
            emitChange({ entity: 'products', action: 'update', id: sale.productId });
          }
        } catch (e) {
          // ignore
        }
        try {
          if (typeof api.addAudit === 'function') await api.addAudit('create', 'sale', sale.id, (sale as unknown as StorageSale).createdBy || undefined, { sale });
        } catch (err) {
          logger.error('Failed to write audit (addSale electron)', err);
        }
        return res as StorageSale;
      }
    }
      try {
        await idb.idbPut('sales', sale);
        emitChange({ entity: 'sales', action: 'add', id: sale.id });
      // ensure localStorage fallback is also updated (jsdom/node env may not expose IndexedDB reads)
      try {
        if (typeof storageAddSale === 'function') storageAddSale(sale as unknown as import('./storage').Sale);
        // Also decrement product stock in storage fallback so getProducts() sees the change
        try {
          const prods = storageGetProducts();
          // If sale contains multiple items, decrement each product accordingly
          if ((sale as unknown as { items?: Array<{ productId: string; quantity: number }> }).items && (sale as unknown as { items?: Array<{ productId: string; quantity: number }> }).items!.length > 0) {
            for (const it of (sale as unknown as { items?: Array<{ productId: string; quantity: number }> }).items || []) {
              const p = prods.find((x: unknown) => (x as import('./storage').Product).id === it.productId) as import('./storage').Product | undefined;
              if (p) {
                const newQty = (p.stockQuantity ?? 0) - (it.quantity ?? 0);
                storageUpdateProduct(p.id, { stockQuantity: newQty } as Partial<import('./storage').Product>);
              }
            }
          } else {
            const p = prods.find((x: unknown) => (x as import('./storage').Product).id === sale.productId) as import('./storage').Product | undefined;
            if (p) {
              const newQty = (p.stockQuantity ?? 0) - sale.quantity;
              storageUpdateProduct(p.id, { stockQuantity: newQty } as Partial<import('./storage').Product>);
            }
          }
        } catch (err) {
          // ignore
        }
      } catch (err) {
        // ignore
      }
      // decrement product stock in idb if present
        try {
          // If sale contains multiple items, decrement each product in IndexedDB
          const itemsArr = (sale as unknown as { items?: Array<{ productId: string; quantity: number }> }).items;
          if (itemsArr && itemsArr.length > 0) {
            for (const it of itemsArr) {
              try {
                const prod = await idb.idbGet<StorageProduct>('products', it.productId);
                if (prod) {
                  prod.stockQuantity = (prod.stockQuantity || 0) - (it.quantity || 0);
                  await idb.idbPut('products', prod);
                  emitChange({ entity: 'products', action: 'update', id: prod.id });
                }
              } catch (err) {
                // ignore per-item
              }
            }
          } else {
            const prod = await idb.idbGet<StorageProduct>('products', sale.productId);
            if (prod) {
              prod.stockQuantity = (prod.stockQuantity || 0) - sale.quantity;
              await idb.idbPut('products', prod);
              emitChange({ entity: 'products', action: 'update', id: prod.id });
            }
          }
        } catch (err) {
          // ignore
        }
      try {
        await idb.idbPut('sales', sale);
        // write audit in fallback storage if available
        try {
          if (typeof storageAddAudit === 'function') storageAddAudit({ action: 'create', entity: 'sale', entityId: sale.id, userId: (sale as unknown as StorageSale).createdBy, meta: { sale } });
        } catch (err) {
          logger.error('Failed to write audit (addSale fallback)', err);
        }
      } catch (e) {
        const res = storageAddSale(sale);
        emitChange({ entity: 'sales', action: 'add', id: sale.id });
        return res;
      }
      return sale;
    } catch (e) {
      const res = storageAddSale(sale);
      emitChange({ entity: 'sales', action: 'add', id: sale.id });
      return res;
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
        emitChange({ entity: 'invoices', action: 'add', id: invoice.id });
        try {
          if (typeof api.addAudit === 'function') await api.addAudit('create', 'invoice', invoice.id, (invoice as unknown as StorageInvoice).createdBy || undefined, { invoice });
        } catch (err) {
          logger.error('Failed to write audit (addInvoice electron)', err);
        }
        return res as StorageInvoice;
      }
    }
    try {
      await idb.idbPut('invoices', invoice);
      emitChange({ entity: 'invoices', action: 'add', id: invoice.id });
      // ensure localStorage fallback is also updated
      try {
        if (typeof storageAddInvoice === 'function') storageAddInvoice(invoice as unknown as import('./storage').Invoice);
      } catch (err) {
        // ignore
      }
      try {
        if (typeof storageAddAudit === 'function') storageAddAudit({ action: 'create', entity: 'invoice', entityId: invoice.id, userId: (invoice as unknown as StorageInvoice).createdBy, meta: { invoice } });
      } catch (err) {
        logger.error('Failed to write audit (addInvoice fallback)', err);
      }
      return invoice;
    } catch (e) {
      const res = storageAddInvoice(invoice);
      emitChange({ entity: 'invoices', action: 'add', id: invoice.id });
      return res;
    }
  },

  // Atomic sale + invoice (desktop): fallback to sequential when not available
  async createSaleWithInvoice(sale: StorageSale, invoice: StorageInvoice) {
    if (isElectronDBAvailable()) {
      const api = (window as unknown as Window).electronAPI!.db as unknown as ElectronDBAPI | undefined;
      if (api && typeof api.createSaleWithInvoice === 'function') {
        const res = await api.createSaleWithInvoice(sale, invoice);
        emitChange({ entity: 'sales', action: 'add', id: sale.id });
        emitChange({ entity: 'invoices', action: 'add', id: invoice.id });
        try {
          const itemsArr = (sale as unknown as { items?: Array<{ productId: string; quantity: number }> }).items;
          if (itemsArr && itemsArr.length > 0) {
            for (const it of itemsArr) {
              if (it?.productId) emitChange({ entity: 'products', action: 'update', id: it.productId });
            }
          } else {
            emitChange({ entity: 'products', action: 'update', id: sale.productId });
          }
          emitChange({ entity: 'stock_movements', action: 'add' });
        } catch (e) {
          // ignore
        }
        try {
          if (typeof api.addAudit === 'function') await api.addAudit('create', 'sale', sale.id, (sale as unknown as StorageSale).createdBy || undefined, { sale, invoice });
        } catch (err) {
          logger.error('Failed to write audit (createSaleWithInvoice electron)', err);
        }
        return res;
      }
    }
    // fallback: try sequential and hope for best
    const s = await this.addSale(sale);
    const inv = await this.addInvoice(invoice);
  // fallback: sale/invoice were created sequentially
    try {
      // attempt to write a combined audit in fallback
      if (typeof storageAddAudit === 'function') storageAddAudit({ action: 'create', entity: 'sale', entityId: sale.id, userId: (sale as unknown as StorageSale).createdBy, meta: { sale, invoice } });
    } catch (err) {
      logger.error('Failed to write audit (createSaleWithInvoice fallback)', err);
    }
    // storage state updated by fallback writes
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
      emitChange({ entity: 'invoices', action: 'update', id });
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
      emitChange({ entity: 'invoices', action: 'delete', id });
      return true;
    } catch (e) {
      emitChange({ entity: 'invoices', action: 'delete', id });
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
      return storageGetUsers ? (storageGetUsers() as StorageUser[]) : [];
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
          logger.error('Failed to write audit (create user)', e);
        }
        return res;
      }
    }
    // fallback to storage
    try {
      const u: StorageUser = { id: user.id, username: user.username, passwordHash: bcrypt.hashSync(user.password || 'changeme', 10), role: user.role || 'commercial' };
      if (typeof storageAddUser === 'function') {
        storageAddUser(u as unknown as Partial<import('./storage').User>);
        emitChange({ entity: 'users', action: 'add', id: u.id });
      }
      try {
        if (typeof storageAddAudit === 'function') storageAddAudit({ action: 'create', entity: 'user', entityId: u.id, meta: { username: u.username } });
      } catch (err) {
        logger.error('Failed to write audit (create user) fallback', err);
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
            logger.error('Failed to write audit (update user)', e);
        }
        return res;
      }
    }
    try {
      const uUpdates: Partial<StorageUser> = {};
      if (updates.username) uUpdates.username = updates.username;
      if (updates.role) uUpdates.role = updates.role;
      if (updates.password) uUpdates.passwordHash = bcrypt.hashSync(updates.password, 10);
      if (typeof storageUpdateUser === 'function') {
        storageUpdateUser(id, uUpdates as unknown as Partial<StorageUser>);
      }
      const users = storageGetUsers ? (storageGetUsers() as StorageUser[]) : [];
      try {
        if (typeof storageAddAudit === 'function') storageAddAudit({ action: 'update', entity: 'user', entityId: id, meta: { updates } });
      } catch (err) {
        logger.error('Failed to write audit (update user)', err);
      }
      emitChange({ entity: 'users', action: 'update', id });
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
          logger.error('Failed to write audit (delete user)', e);
        }
        return res;
      }
    }
    try {
      if (typeof storageDeleteUser === 'function') storageDeleteUser(id);
      try {
        if (typeof storageAddAudit === 'function') storageAddAudit({ action: 'delete', entity: 'user', entityId: id });
      } catch (err) {
        logger.error('Failed to write audit (delete user) fallback', err);
      }
      emitChange({ entity: 'users', action: 'delete', id });
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

  // Stock Movements
  async getStockMovements() {
    if (isElectronDBAvailable()) {
      const api = (window as unknown as Window).electronAPI!.db as unknown as ElectronDBAPI | undefined;
      if (api && typeof api.getStockMovements === 'function') {
        try {
          return await api.getStockMovements();
        } catch (err) {
          logger.error('Electron getStockMovements failed', err);
          return [];
        }
      }
    }
    try {
      const items = await idb.idbGetAll<import('./storage').StockMovement>('stock_movements');
      if (items && items.length > 0) return items;
    } catch (e) {
      // ignore
    }
    try {
      return storageGetStockMovements ? storageGetStockMovements() : [];
    } catch (e) {
      return [];
    }

  },

  async addStockMovement(movement: import('./storage').StockMovement) {
    if (isElectronDBAvailable()) {
      const api = (window as unknown as Window).electronAPI!.db as unknown as ElectronDBAPI | undefined;
      if (api && typeof api.addStockMovement === 'function') {
        const res = await api.addStockMovement(movement);
        emitChange({ entity: 'stock_movements', action: 'add', id: movement.id });
        // Electron persists stock_movements and updates product stock atomically in main.
        // Emit a products change so product lists/stock panels refresh immediately.
        console.debug('Emitting products change for productId:', movement.productId);
        emitChange({ entity: 'products', action: 'update', id: movement.productId });
        try {
          if (typeof api.addAudit === 'function') await api.addAudit('create', 'stock_movement', movement.id, (movement as unknown as import('./storage').StockMovement).createdBy || undefined, { movement });
        } catch (err) {
          logger.error('Failed to write audit (addStockMovement electron)', err);
        }
        return res;
      }
    }
    // Fallback: try IndexedDB first
    try {
      await idb.idbPut('stock_movements', movement);
      emitChange({ entity: 'stock_movements', action: 'add', id: movement.id });
      try {
        if (typeof storageAddStockMovement === 'function') storageAddStockMovement(movement as unknown as import('./storage').StockMovement);
      } catch (err) {
        // ignore
      }
      return movement;
    } catch (e) {
      const res = storageAddStockMovement(movement as unknown as import('./storage').StockMovement);
      emitChange({ entity: 'stock_movements', action: 'add', id: movement.id });
      return res;
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
      logger.error('db.resetDemoData fallback failed', err);
      return false;
    }
  },

  async resetProductCatalog() {
    if (isElectronDBAvailable()) {
      const fn = (window as unknown as Window).electronAPI?.db?.resetProductCatalog;
      if (typeof fn !== 'function') {
        logger.error('Electron resetProductCatalog IPC is not available. Please restart the Electron app to load updated main/preload.');
        return false;
      }
      const ok = await fn();
      emitChange({ entity: 'products', action: 'reset' });
      emitChange({ entity: 'stock_movements', action: 'reset' });
      return !!ok;
    }

    try {
      // Browser fallback: wipe only products and stock movements
      try {
        const dbi = await (async () => {
          try {
            // openDB is internal; use idbGetAll + delete to clear
            const products = await idb.idbGetAll<StorageProduct>('products');
            for (const p of products) {
              try { await idb.idbDelete('products', p.id); } catch { /* ignore */ }
            }
            const moves = await idb.idbGetAll<import('./storage').StockMovement>('stock_movements');
            for (const m of moves) {
              try { await idb.idbDelete('stock_movements', m.id); } catch { /* ignore */ }
            }
            return true;
          } catch {
            return false;
          }
        })();
        void dbi;
      } catch {
        // ignore
      }

      try {
        localStorage.removeItem('winecellar_products');
        localStorage.removeItem('winecellar_stock_movements');
      } catch {
        // ignore
      }

      try {
        seedWineCatalog();
      } catch {
        // ignore
      }

      emitChange({ entity: 'products', action: 'reset' });
      emitChange({ entity: 'stock_movements', action: 'reset' });
      return true;
    } catch (err) {
      logger.error('db.resetProductCatalog fallback failed', err);
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

  // Desktop-only: read-only DB info
  async getDatabaseInfo() {
    if (isElectronDBAvailable()) {
      const api = (window as unknown as Window).electronAPI?.db as unknown as ElectronDBAPI | undefined;
      if (api && typeof (api as unknown as { getDatabaseInfo?: () => Promise<unknown> }).getDatabaseInfo === 'function') {
        return (api as unknown as { getDatabaseInfo: () => Promise<unknown> }).getDatabaseInfo();
      }
    }
    return { success: false, error: 'not available' };
  },

  // Desktop-only: export current SQLite DB to a user-chosen file path
  async exportDatabaseAs() {
    if (isElectronDBAvailable()) {
      const api = (window as unknown as Window).electronAPI?.db as unknown as ElectronDBAPI | undefined;
      if (api && typeof (api as unknown as { exportDatabaseAs?: () => Promise<unknown> }).exportDatabaseAs === 'function') {
        return (api as unknown as { exportDatabaseAs: () => Promise<unknown> }).exportDatabaseAs();
      }
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

  async pickRestoreFile() {
    if (isElectronDBAvailable()) {
      const api = (window as unknown as Window).electronAPI?.db as unknown as ElectronDBAPI | undefined;
      if (api && typeof (api as unknown as { pickRestoreFile?: () => Promise<unknown> }).pickRestoreFile === 'function') {
        return (api as unknown as { pickRestoreFile: () => Promise<unknown> }).pickRestoreFile();
      }
    }
    return { success: false, error: 'not available' };
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
