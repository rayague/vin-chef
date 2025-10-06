// Local storage management for the wine cellar application

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: 'admin' | 'commercial';
}

export interface Product {
  id: string;
  name: string;
  category: string;
  unitPrice: number;
  stockQuantity: number;
  description: string;
}

export interface Client {
  id: string;
  name: string;
  contactInfo: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface Sale {
  id: string;
  productId: string;
  clientId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  date: string;
  invoiceNumber: string;
}

export interface Invoice {
  id: string;
  saleId: string;
  invoiceNumber: string;
  date: string;
  clientName: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  tva: number;
}

// Storage keys
const STORAGE_KEYS = {
  USERS: 'winecellar_users',
  PRODUCTS: 'winecellar_products',
  CLIENTS: 'winecellar_clients',
  SALES: 'winecellar_sales',
  INVOICES: 'winecellar_invoices',
  CURRENT_USER: 'winecellar_current_user',
  INVOICE_COUNTER: 'winecellar_invoice_counter',
};

// Generic storage functions
export const storage = {
  get: <T>(key: string): T[] => {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  set: <T>(key: string, data: T[]): void => {
    localStorage.setItem(key, JSON.stringify(data));
  },

  add: <T extends { id: string }>(key: string, item: T): void => {
    const items = storage.get<T>(key);
    items.push(item);
    storage.set(key, items);
  },

  update: <T extends { id: string }>(key: string, id: string, updates: Partial<T>): void => {
    const items = storage.get<T>(key);
    const index = items.findIndex(item => item.id === id);
    if (index !== -1) {
      items[index] = { ...items[index], ...updates };
      storage.set(key, items);
    }
  },

  delete: <T extends { id: string }>(key: string, id: string): void => {
    const items = storage.get<T>(key);
    const filtered = items.filter(item => item.id !== id);
    storage.set(key, filtered);
  },

  clear: (key: string): void => {
    localStorage.removeItem(key);
  },
};

// Users
export const getUsers = () => storage.get<User>(STORAGE_KEYS.USERS);
export const addUser = (user: User) => storage.add(STORAGE_KEYS.USERS, user);
export const getUserByUsername = (username: string) => 
  getUsers().find(u => u.username === username);

// Products
export const getProducts = () => storage.get<Product>(STORAGE_KEYS.PRODUCTS);
export const addProduct = (product: Product) => storage.add(STORAGE_KEYS.PRODUCTS, product);
export const updateProduct = (id: string, updates: Partial<Product>) => 
  storage.update<Product>(STORAGE_KEYS.PRODUCTS, id, updates);
export const deleteProduct = (id: string) => storage.delete(STORAGE_KEYS.PRODUCTS, id);

// Clients
export const getClients = () => storage.get<Client>(STORAGE_KEYS.CLIENTS);
export const addClient = (client: Client) => storage.add(STORAGE_KEYS.CLIENTS, client);
export const updateClient = (id: string, updates: Partial<Client>) => 
  storage.update<Client>(STORAGE_KEYS.CLIENTS, id, updates);
export const deleteClient = (id: string) => storage.delete(STORAGE_KEYS.CLIENTS, id);

// Sales
export const getSales = () => storage.get<Sale>(STORAGE_KEYS.SALES);
export const addSale = (sale: Sale) => storage.add(STORAGE_KEYS.SALES, sale);

// Invoices
export const getInvoices = () => storage.get<Invoice>(STORAGE_KEYS.INVOICES);
export const addInvoice = (invoice: Invoice) => storage.add(STORAGE_KEYS.INVOICES, invoice);

// Current user (session)
export const setCurrentUser = (user: User | null) => {
  if (user) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  }
};

export const getCurrentUser = (): User | null => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

// Invoice counter
export const getNextInvoiceNumber = (): string => {
  const counter = parseInt(localStorage.getItem(STORAGE_KEYS.INVOICE_COUNTER) || '0', 10);
  const nextCounter = counter + 1;
  localStorage.setItem(STORAGE_KEYS.INVOICE_COUNTER, nextCounter.toString());
  return `FAC-${new Date().getFullYear()}-${String(nextCounter).padStart(5, '0')}`;
};

// Initialize with demo data
export const initializeDemoData = () => {
  // Check if data already exists
  if (getUsers().length > 0) return;

  // Demo users (password: "admin123" and "demo123")
  const demoUsers: User[] = [
    {
      id: '1',
      username: 'admin',
      passwordHash: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', // admin123
      role: 'admin',
    },
    {
      id: '2',
      username: 'commercial',
      passwordHash: '$2a$10$5fHq7AximXUGbpH0N0R7fOSH8kZE5h0iZnYPm7xqYrF3i5KfJPSVe', // demo123
      role: 'commercial',
    },
  ];

  // Demo products
  const demoProducts: Product[] = [
    {
      id: '1',
      name: 'Château Margaux 2015',
      category: 'Bordeaux Rouge',
      unitPrice: 450000,
      stockQuantity: 12,
      description: 'Premier Grand Cru Classé',
    },
    {
      id: '2',
      name: 'Meursault 1er Cru 2018',
      category: 'Bourgogne Blanc',
      unitPrice: 280000,
      stockQuantity: 24,
      description: 'Vin blanc sec de Bourgogne',
    },
    {
      id: '3',
      name: 'Champagne Dom Pérignon 2012',
      category: 'Champagne',
      unitPrice: 650000,
      stockQuantity: 18,
      description: 'Champagne prestige',
    },
  ];

  // Demo clients
  const demoClients: Client[] = [
    {
      id: '1',
      name: 'Restaurant Le Gourmet',
      contactInfo: '+229 97 00 00 01',
      email: 'contact@legourmet.bj',
      phone: '+229 97 00 00 01',
      address: 'Cotonou, Bénin',
    },
    {
      id: '2',
      name: 'Hôtel Royal Palace',
      contactInfo: '+229 97 00 00 02',
      email: 'achats@royalpalace.bj',
      phone: '+229 97 00 00 02',
      address: 'Porto-Novo, Bénin',
    },
  ];

  // Save demo data
  storage.set(STORAGE_KEYS.USERS, demoUsers);
  storage.set(STORAGE_KEYS.PRODUCTS, demoProducts);
  storage.set(STORAGE_KEYS.CLIENTS, demoClients);
  storage.set(STORAGE_KEYS.SALES, []);
  storage.set(STORAGE_KEYS.INVOICES, []);
};
