const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

let db;

function getSafeStorage() {
  try {
    const electron = require('electron');
    return electron && electron.safeStorage ? electron.safeStorage : null;
  } catch (e) {
    return null;
  }
}

function encryptSecret(plainText) {
  if (!plainText) return null;
  const safeStorage = getSafeStorage();
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) return plainText;
  return safeStorage.encryptString(String(plainText)).toString('base64');
}

function decryptSecret(value) {
  if (!value) return null;
  const safeStorage = getSafeStorage();
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) return String(value);
  return safeStorage.decryptString(Buffer.from(String(value), 'base64'));
}

function ensureSchema() {
  // users
  db.prepare(
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`
  ).run();

  // products
  db.prepare(
    `CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      unit_price INTEGER NOT NULL,
      stock_quantity INTEGER NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    )`
  ).run();

  // clients
  db.prepare(
    `CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact_info TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      created_at TEXT NOT NULL
    )`
  ).run();

  // sales
  db.prepare(
    `CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      client_id TEXT,
      quantity INTEGER NOT NULL,
      unit_price INTEGER NOT NULL,
      total_price INTEGER NOT NULL,
      date TEXT NOT NULL,
      invoice_id TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL
    )`
  ).run();

  // invoices
  db.prepare(
    `CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT UNIQUE NOT NULL,
      sale_id TEXT,
      date TEXT NOT NULL,
      client_snapshot TEXT,
      product_snapshot TEXT,
      total_price INTEGER NOT NULL,
      tva INTEGER,
      ifu TEXT,
      immutable_flag INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    )`
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS emcf_points_of_sale (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      token TEXT,
      token_encrypted INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT
    )`
  ).run();

  // invoice counter
  db.prepare(
    `CREATE TABLE IF NOT EXISTS invoice_counter (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      counter INTEGER NOT NULL
    )`
  ).run();

  const row = db.prepare('SELECT counter FROM invoice_counter WHERE id = 1').get();
  if (!row) {
    db.prepare('INSERT INTO invoice_counter (id, counter) VALUES (1, 0)').run();
  }

  // categories
  db.prepare(
    `CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL
    )`
  ).run();

  const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get().c;
  if (catCount === 0) {
    const now = new Date().toISOString();
    const insertC = db.prepare('INSERT INTO categories (id, name, description, created_at) VALUES (?, ?, ?, ?)');
    insertC.run('1', 'Rouges', 'Vins rouges', now);
    insertC.run('2', 'Blancs', 'Vins blancs', now);
  }

  const invoiceCols = db.prepare('PRAGMA table_info(invoices)').all().map((r) => r.name);
  const addInvoiceColIfMissing = (colName, colDef) => {
    if (!invoiceCols.includes(colName)) {
      db.prepare(`ALTER TABLE invoices ADD COLUMN ${colName} ${colDef}`).run();
      invoiceCols.push(colName);
    }
  };
  addInvoiceColIfMissing('invoice_type', "TEXT DEFAULT 'FV'");
  addInvoiceColIfMissing('original_invoice_reference', 'TEXT');
  addInvoiceColIfMissing('aib_rate', 'INTEGER DEFAULT 0');
  addInvoiceColIfMissing('payment_methods', 'TEXT');
  addInvoiceColIfMissing('emcf_uid', 'TEXT');
  addInvoiceColIfMissing('emcf_status', 'TEXT');
  addInvoiceColIfMissing('emcf_code_mec_e_f_dgi', 'TEXT');
  addInvoiceColIfMissing('emcf_qr_code', 'TEXT');
  addInvoiceColIfMissing('emcf_date_time', 'TEXT');
  addInvoiceColIfMissing('emcf_counters', 'TEXT');
  addInvoiceColIfMissing('emcf_nim', 'TEXT');
  addInvoiceColIfMissing('emcf_pos_id', 'TEXT');
  addInvoiceColIfMissing('emcf_raw_response', 'TEXT');
  addInvoiceColIfMissing('emcf_submitted_at', 'TEXT');
  addInvoiceColIfMissing('emcf_confirmed_at', 'TEXT');

  const productCols = db.prepare('PRAGMA table_info(products)').all().map((r) => r.name);
  const addProductColIfMissing = (colName, colDef) => {
    if (!productCols.includes(colName)) {
      db.prepare(`ALTER TABLE products ADD COLUMN ${colName} ${colDef}`).run();
      productCols.push(colName);
    }
  };
  addProductColIfMissing('tax_group', "TEXT DEFAULT 'B'");
  addProductColIfMissing('tva_rate', 'INTEGER DEFAULT 18');

  const clientCols = db.prepare('PRAGMA table_info(clients)').all().map((r) => r.name);
  const addClientColIfMissing = (colName, colDef) => {
    if (!clientCols.includes(colName)) {
      db.prepare(`ALTER TABLE clients ADD COLUMN ${colName} ${colDef}`).run();
      clientCols.push(colName);
    }
  };
  addClientColIfMissing('ifu', 'TEXT');
  addClientColIfMissing('aib_registration', 'INTEGER DEFAULT 0');
  addClientColIfMissing('aib_rate', 'INTEGER DEFAULT 0');
}

function init(app) {
  const userData = app.getPath('userData');
  const appDir = path.join(userData, 'vin-chef');
  if (!fs.existsSync(appDir)) fs.mkdirSync(appDir, { recursive: true });
  const dbPath = path.join(appDir, 'data.sqlite');

  db = new Database(dbPath);
  ensureSchema();

  // Seed demo users/products if no users
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount === 0) {
    const now = new Date().toISOString();
    const users = [
      { id: '1', username: 'admin', password: 'admin123', role: 'admin' },
      { id: '2', username: 'commercial', password: 'demo123', role: 'commercial' },
    ];
    const insert = db.prepare('INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)');
    for (const u of users) {
      const hash = bcrypt.hashSync(u.password, 10);
      insert.run(u.id, u.username, hash, u.role, now);
    }
  }

  // Seed products if empty
  const prodCount = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
  if (prodCount === 0) {
    const now = new Date().toISOString();
    const insertP = db.prepare('INSERT INTO products (id, name, category, unit_price, stock_quantity, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    insertP.run('1', 'Château Margaux 2015', 'Bordeaux Rouge', 450000, 12, 'Premier Grand Cru Classé', now);
    insertP.run('2', 'Meursault 1er Cru 2018', 'Bourgogne Blanc', 280000, 24, 'Vin blanc sec de Bourgogne', now);
    insertP.run('3', 'Champagne Dom Pérignon 2012', 'Champagne', 650000, 18, 'Champagne prestige', now);
  }

  const safeJsonParse = (value) => {
    try {
      if (!value) return null;
      if (typeof value !== 'string') return value;
      return JSON.parse(value);
    } catch (e) {
      return null;
    }
  };

  return {
    // Users
    getUserByUsername: (username) => db.prepare('SELECT * FROM users WHERE username = ?').get(username),
    createUser: (id, username, password, role) => {
      const hash = bcrypt.hashSync(password, 10);
      const now = new Date().toISOString();
      db.prepare('INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)').run(id, username, hash, role, now);
      return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    },
    getUsers: () => db.prepare('SELECT id, username, role, created_at, NULL as email, NULL as phone FROM users').all(),
    addUser: (user) => {
      const now = new Date().toISOString();
      const hash = bcrypt.hashSync(user.password || 'changeme', 10);
      db.prepare('INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(user.id, user.username, hash, user.role || 'commercial', now);
      const row = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(user.id);
      try { if (typeof module.exports.init === 'function') {} } catch (e) {}
      try { if (typeof this.addAudit === 'function') this.addAudit('create', 'user', user.id, null, { username: user.username }); } catch (e) {}
      return row;
    },
    updateUser: (id, updates) => {
      const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      if (updates.password) {
        const hash = bcrypt.hashSync(updates.password, 10);
        db.prepare('UPDATE users SET username = ?, password_hash = ?, role = ? WHERE id = ?')
          .run(updated.username || existing.username, hash, updated.role || existing.role, id);
      } else {
        db.prepare('UPDATE users SET username = ?, role = ? WHERE id = ?')
          .run(updated.username || existing.username, updated.role || existing.role, id);
      }
      const row = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(id);
      try { if (typeof this.addAudit === 'function') this.addAudit('update', 'user', id, null, { updates }); } catch (e) {}
      return row;
    },
    deleteUser: (id) => db.prepare('DELETE FROM users WHERE id = ?').run(id),

    // Products
    getProducts: () => db.prepare('SELECT * FROM products').all(),
    addProduct: (product) => {
      const now = new Date().toISOString();
      // Support both camelCase and snake_case incoming product shapes from tests or other callers
      const unitPrice = product.unitPrice ?? product.unit_price;
      const stockQuantity = product.stockQuantity ?? product.stock_quantity;
      const taxGroup = product.taxGroup ?? product.tax_group ?? 'B';
      const tvaRate = product.tvaRate ?? product.tva_rate ?? 18;
      db.prepare('INSERT INTO products (id, name, category, unit_price, stock_quantity, description, tax_group, tva_rate, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(product.id, product.name, product.category || null, unitPrice, stockQuantity, product.description || null, taxGroup, tvaRate, now);
      return db.prepare('SELECT * FROM products WHERE id = ?').get(product.id);
    },
    updateProduct: (id, updates) => {
      const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates, updated_at: new Date().toISOString() };
      // accept either naming style for unit price / stock quantity
      const unitPrice = updated.unit_price ?? updated.unitPrice;
      const stockQuantity = updated.stock_quantity ?? updated.stockQuantity;
      const taxGroup = updated.tax_group ?? updated.taxGroup ?? existing.tax_group ?? 'B';
      const tvaRate = updated.tva_rate ?? updated.tvaRate ?? existing.tva_rate ?? 18;
      db.prepare('UPDATE products SET name = ?, category = ?, unit_price = ?, stock_quantity = ?, description = ?, tax_group = ?, tva_rate = ?, updated_at = ? WHERE id = ?')
        .run(updated.name, updated.category, unitPrice, stockQuantity, updated.description, taxGroup, tvaRate, updated.updated_at, id);
      return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    },
    deleteProduct: (id) => db.prepare('DELETE FROM products WHERE id = ?').run(id),

    // Clients
    getClients: () => db.prepare('SELECT * FROM clients').all(),
    addClient: (client) => {
      const now = new Date().toISOString();
      const ifu = client.ifu ?? null;
      const aibRegistration = client.aibRegistration ? 1 : (client.aib_registration ? 1 : 0);
      const aibRate = client.aibRate ?? client.aib_rate ?? 0;
      db.prepare('INSERT INTO clients (id, name, contact_info, email, phone, address, ifu, aib_registration, aib_rate, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(client.id, client.name, client.contactInfo || null, client.email || null, client.phone || null, client.address || null, ifu, aibRegistration, aibRate, now);
      return db.prepare('SELECT * FROM clients WHERE id = ?').get(client.id);
    },
    // Categories
    getCategories: () => db.prepare('SELECT * FROM categories').all(),
    addCategory: (category) => {
      const now = new Date().toISOString();
      db.prepare('INSERT INTO categories (id, name, description, created_at) VALUES (?, ?, ?, ?)')
        .run(category.id, category.name, category.description || null, now);
      return db.prepare('SELECT * FROM categories WHERE id = ?').get(category.id);
    },
    updateCategory: (id, updates) => {
      const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      db.prepare('UPDATE categories SET name = ?, description = ? WHERE id = ?')
        .run(updated.name, updated.description || null, id);
      return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    },
    deleteCategory: (id) => db.prepare('DELETE FROM categories WHERE id = ?').run(id),
    updateClient: (id, updates) => {
      const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      const nextIfu = updated.ifu ?? existing.ifu ?? null;
      const nextAibRegistration = (updated.aib_registration ?? (updated.aibRegistration ? 1 : 0)) ? 1 : 0;
      const nextAibRate = updated.aib_rate ?? updated.aibRate ?? existing.aib_rate ?? 0;
      db.prepare('UPDATE clients SET name = ?, contact_info = ?, email = ?, phone = ?, address = ?, ifu = ?, aib_registration = ?, aib_rate = ? WHERE id = ?')
        .run(updated.name, updated.contact_info ?? updated.contactInfo, updated.email, updated.phone, updated.address, nextIfu, nextAibRegistration, nextAibRate, id);
      return db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    },
    deleteClient: (id) => db.prepare('DELETE FROM clients WHERE id = ?').run(id),

    // Sales
    addSale: (sale) => {
      const now = new Date().toISOString();
      const insert = db.prepare('INSERT INTO sales (id, product_id, client_id, quantity, unit_price, total_price, date, invoice_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      insert.run(sale.id, sale.productId, sale.clientId || null, sale.quantity, sale.unitPrice, sale.totalPrice, sale.date, sale.invoiceId || null, sale.createdBy || null, now);

      // decrement stock
      try {
        if (sale && Array.isArray(sale.items) && sale.items.length > 0) {
          const upd = db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?');
          for (const it of sale.items) {
            if (!it || !it.productId) continue;
            const qty = Number(it.quantity);
            if (!Number.isFinite(qty)) continue;
            upd.run(qty, it.productId);
          }
        } else {
          db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?').run(sale.quantity, sale.productId);
        }
      } catch (e) {
        // fallback to legacy single-product decrement
        db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?').run(sale.quantity, sale.productId);
      }

      return db.prepare('SELECT * FROM sales WHERE id = ?').get(sale.id);
    },
    getSales: () => {
      const rows = db
        .prepare('SELECT s.*, i.invoice_number AS invoice_number FROM sales s LEFT JOIN invoices i ON i.sale_id = s.id')
        .all();
      return rows.map((r) => ({
        ...r,
        productId: r.product_id,
        clientId: r.client_id,
        unitPrice: r.unit_price,
        totalPrice: r.total_price,
        invoiceId: r.invoice_id,
        invoiceNumber: r.invoice_number,
        createdBy: r.created_by,
        createdAt: r.created_at,
      }));
    },

    // Invoices
    getNextInvoiceNumber: () => {
      const row = db.prepare('SELECT counter FROM invoice_counter WHERE id = 1').get();
      const next = row.counter + 1;
      db.prepare('UPDATE invoice_counter SET counter = ? WHERE id = 1').run(next);
      const num = `FAC-${new Date().getFullYear()}-${String(next).padStart(5, '0')}`;
      return num;
    },
    createInvoice: (invoice) => {
      const now = new Date().toISOString();
      const invoiceType = invoice.invoice_type ?? invoice.invoiceType ?? 'FV';
      const originalInvoiceReference = invoice.original_invoice_reference ?? invoice.originalInvoiceReference ?? null;
      const aibRate = invoice.aib_rate ?? invoice.aibRate ?? 0;
      const paymentMethods = invoice.payment_methods ?? (invoice.paymentMethods ? JSON.stringify(invoice.paymentMethods) : null);
      const emcfUid = invoice.emcf_uid ?? invoice.emcfUid ?? null;
      const emcfStatus = invoice.emcf_status ?? invoice.emcfStatus ?? null;
      const emcfCode = invoice.emcf_code_mec_e_f_dgi ?? invoice.emcfCodeMECeFDGI ?? null;
      const emcfQr = invoice.emcf_qr_code ?? invoice.emcfQrCode ?? null;
      const emcfDateTime = invoice.emcf_date_time ?? invoice.emcfDateTime ?? null;
      const emcfCounters = invoice.emcf_counters ?? (invoice.emcfCounters ? (typeof invoice.emcfCounters === 'string' ? invoice.emcfCounters : JSON.stringify(invoice.emcfCounters)) : null);
      const emcfNim = invoice.emcf_nim ?? invoice.emcfNim ?? null;
      const emcfPosId = invoice.emcf_pos_id ?? invoice.emcfPosId ?? null;
      const emcfRawResponse = invoice.emcf_raw_response ?? (invoice.emcfRawResponse ? (typeof invoice.emcfRawResponse === 'string' ? invoice.emcfRawResponse : JSON.stringify(invoice.emcfRawResponse)) : null);
      const emcfSubmittedAt = invoice.emcf_submitted_at ?? invoice.emcfSubmittedAt ?? null;
      const emcfConfirmedAt = invoice.emcf_confirmed_at ?? invoice.emcfConfirmedAt ?? null;
      db.prepare(
        'INSERT INTO invoices (id, invoice_number, sale_id, date, client_snapshot, product_snapshot, total_price, tva, ifu, immutable_flag, invoice_type, original_invoice_reference, aib_rate, payment_methods, emcf_uid, emcf_status, emcf_code_mec_e_f_dgi, emcf_qr_code, emcf_date_time, emcf_counters, emcf_nim, emcf_pos_id, emcf_raw_response, emcf_submitted_at, emcf_confirmed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
        .run(
          invoice.id,
          invoice.invoiceNumber,
          invoice.saleId || null,
          invoice.date,
          invoice.clientSnapshot || null,
          invoice.productSnapshot || null,
          invoice.totalPrice,
          invoice.tva || 0,
          invoice.ifu || null,
          invoice.immutableFlag ? 1 : 0,
          invoiceType,
          originalInvoiceReference,
          aibRate,
          paymentMethods,
          emcfUid,
          emcfStatus,
          emcfCode,
          emcfQr,
          emcfDateTime,
          emcfCounters,
          emcfNim,
          emcfPosId,
          emcfRawResponse,
          emcfSubmittedAt,
          emcfConfirmedAt,
          now
        );
      return db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoice.id);
    },
    // Atomic operation: insert sale, decrement stock, create invoice in a single transaction
    createSaleWithInvoice: (sale, invoice) => {
      const now = new Date().toISOString();
      const tx = db.transaction((s, i) => {
        // insert sale
        db.prepare('INSERT INTO sales (id, product_id, client_id, quantity, unit_price, total_price, date, invoice_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(s.id, s.productId, s.clientId || null, s.quantity, s.unitPrice, s.totalPrice, s.date, s.invoiceId || null, s.createdBy || null, now);
        // decrement stock
        if (s && Array.isArray(s.items) && s.items.length > 0) {
          const upd = db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?');
          for (const it of s.items) {
            if (!it || !it.productId) continue;
            const qty = Number(it.quantity);
            if (!Number.isFinite(qty)) continue;
            upd.run(qty, it.productId);
          }
        } else {
          db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?').run(s.quantity, s.productId);
        }
        const emcfUid = i.emcf_uid ?? i.emcfUid ?? null;
        const emcfStatus = i.emcf_status ?? i.emcfStatus ?? null;
        const emcfCode = i.emcf_code_mec_e_f_dgi ?? i.emcfCodeMECeFDGI ?? null;
        const emcfQr = i.emcf_qr_code ?? i.emcfQrCode ?? null;
        const emcfDateTime = i.emcf_date_time ?? i.emcfDateTime ?? null;
        const emcfCounters = i.emcf_counters ?? (i.emcfCounters ? (typeof i.emcfCounters === 'string' ? i.emcfCounters : JSON.stringify(i.emcfCounters)) : null);
        const emcfNim = i.emcf_nim ?? i.emcfNim ?? null;
        const emcfPosId = i.emcf_pos_id ?? i.emcfPosId ?? null;
        const emcfRawResponse = i.emcf_raw_response ?? (i.emcfRawResponse ? (typeof i.emcfRawResponse === 'string' ? i.emcfRawResponse : JSON.stringify(i.emcfRawResponse)) : null);
        const emcfSubmittedAt = i.emcf_submitted_at ?? i.emcfSubmittedAt ?? null;
        const emcfConfirmedAt = i.emcf_confirmed_at ?? i.emcfConfirmedAt ?? null;
        const invoiceType = i.invoice_type ?? i.invoiceType ?? 'FV';
        const originalInvoiceReference = i.original_invoice_reference ?? i.originalInvoiceReference ?? null;
        const aibRate = i.aib_rate ?? i.aibRate ?? 0;
        const paymentMethods = i.payment_methods ?? (i.paymentMethods ? JSON.stringify(i.paymentMethods) : null);
        // insert invoice
        const invCols = [
          'id',
          'invoice_number',
          'sale_id',
          'date',
          'client_snapshot',
          'product_snapshot',
          'total_price',
          'tva',
          'ifu',
          'immutable_flag',
          'invoice_type',
          'original_invoice_reference',
          'aib_rate',
          'payment_methods',
          'emcf_uid',
          'emcf_status',
          'emcf_code_mec_e_f_dgi',
          'emcf_qr_code',
          'emcf_date_time',
          'emcf_counters',
          'emcf_nim',
          'emcf_pos_id',
          'emcf_raw_response',
          'emcf_submitted_at',
          'emcf_confirmed_at',
          'created_at',
        ];
        const invValues = [
          i.id,
          i.invoiceNumber,
          s.id,
          i.date,
          i.clientSnapshot || null,
          i.productSnapshot || null,
          i.totalPrice,
          i.tva || 0,
          i.ifu || null,
          i.immutableFlag ? 1 : 0,
          invoiceType,
          originalInvoiceReference,
          aibRate,
          paymentMethods,
          emcfUid,
          emcfStatus,
          emcfCode,
          emcfQr,
          emcfDateTime,
          emcfCounters,
          emcfNim,
          emcfPosId,
          emcfRawResponse,
          emcfSubmittedAt,
          emcfConfirmedAt,
          now,
        ];
        const invSql = `INSERT INTO invoices (${invCols.join(', ')}) VALUES (${invCols.map(() => '?').join(', ')})`;
        db.prepare(invSql).run(...invValues);
      });
      try {
        tx(sale, invoice);
        return {
          sale: db.prepare('SELECT * FROM sales WHERE id = ?').get(sale.id),
          invoice: db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoice.id),
        };
      } catch (err) {
        console.error('createSaleWithInvoice transaction failed', err);
        throw err;
      }
    },
    getInvoices: () => {
      const rows = db.prepare('SELECT * FROM invoices').all();
      return rows.map((r) => {
        const clientSnap = safeJsonParse(r.client_snapshot) || null;
        const productSnap = safeJsonParse(r.product_snapshot) || null;
        const paymentMethods = safeJsonParse(r.payment_methods) || undefined;

        let productName = '—';
        let quantity = 0;
        let unitPrice = 0;
        let items = null;
        try {
          if (Array.isArray(productSnap)) {
            productName = productSnap.length > 1 ? 'Multiple produits' : (productSnap[0]?.description || productSnap[0]?.name || '—');
            quantity = productSnap.reduce((s, it) => s + Number(it?.quantity || 0), 0);
            unitPrice = Number(productSnap[0]?.unitPrice || productSnap[0]?.price || 0);
            items = productSnap.map((it) => ({
              description: it?.description || it?.name || '—',
              quantity: Number(it?.quantity || 0),
              unitPrice: Number(it?.unitPrice || it?.price || 0),
              discount: it?.discount !== undefined && it?.discount !== null ? Number(it.discount) : undefined,
            }));
          } else if (productSnap && typeof productSnap === 'object') {
            productName = productSnap.description || productSnap.name || '—';
            quantity = Number(productSnap.quantity || 0);
            unitPrice = Number(productSnap.unitPrice || productSnap.price || 0);
            items = [{
              description: productSnap.description || productSnap.name || '—',
              quantity: Number(productSnap.quantity || 0),
              unitPrice: Number(productSnap.unitPrice || productSnap.price || 0),
              discount: productSnap.discount !== undefined && productSnap.discount !== null ? Number(productSnap.discount) : undefined,
            }];
          }
        } catch (e) {
          // ignore
        }

        const clientName = (clientSnap && clientSnap.name) ? clientSnap.name : '—';
        const clientIFU = (clientSnap && clientSnap.ifu) ? clientSnap.ifu : (r.ifu || undefined);
        const clientPhone = (clientSnap && (clientSnap.phone || clientSnap.contactInfo || clientSnap.contact)) ? (clientSnap.phone || clientSnap.contactInfo || clientSnap.contact) : undefined;
        const clientAddress = (clientSnap && clientSnap.address) ? clientSnap.address : undefined;

        return {
          id: r.id,
          saleId: r.sale_id,
          invoiceNumber: r.invoice_number,
          date: r.date,
          clientName,
          clientIFU,
          clientPhone,
          clientAddress,
          items: items || undefined,
          productName,
          quantity,
          unitPrice,
          totalPrice: r.total_price,
          tva: r.tva || 0,
          tvaRate: 18,
          invoiceType: r.invoice_type || 'FV',
          originalInvoiceReference: r.original_invoice_reference || undefined,
          aibRate: typeof r.aib_rate === 'number' ? r.aib_rate : Number(r.aib_rate || 0),
          paymentMethods,
          immutableFlag: r.immutable_flag === 1,
          createdAt: r.created_at,
          emcfUid: r.emcf_uid,
          emcfStatus: r.emcf_status,
          emcfCodeMECeFDGI: r.emcf_code_mec_e_f_dgi,
          emcfQrCode: r.emcf_qr_code,
          emcfDateTime: r.emcf_date_time,
          emcfCounters: r.emcf_counters,
          emcfNim: r.emcf_nim,
          emcfPosId: r.emcf_pos_id,
          emcfRawResponse: safeJsonParse(r.emcf_raw_response) || r.emcf_raw_response,
          emcfSubmittedAt: r.emcf_submitted_at,
          emcfConfirmedAt: r.emcf_confirmed_at,
        };
      });
    },
    updateInvoice: (id, updates) => {
      const row = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
      if (!row) return null;
      if (row.immutable_flag === 1) throw new Error('Invoice is immutable and cannot be modified');
      const updated = { ...row, ...updates };
      const emcfCode =
        updated.emcf_code_mec_e_f_dgi ??
        updated.emcfCodeMECeFDGI ??
        updated.emcf_code_mec_e_f_dgi;
      const invoiceType = updated.invoice_type ?? updated.invoiceType ?? row.invoice_type ?? 'FV';
      const originalInvoiceReference = updated.original_invoice_reference ?? updated.originalInvoiceReference ?? row.original_invoice_reference ?? null;
      const aibRate = updated.aib_rate ?? updated.aibRate ?? row.aib_rate ?? 0;
      const paymentMethods = updated.payment_methods ?? (updated.paymentMethods ? JSON.stringify(updated.paymentMethods) : row.payment_methods ?? null);
      db.prepare(
        'UPDATE invoices SET invoice_number = ?, date = ?, client_snapshot = ?, product_snapshot = ?, total_price = ?, tva = ?, ifu = ?, immutable_flag = ?, invoice_type = ?, original_invoice_reference = ?, aib_rate = ?, payment_methods = ?, emcf_uid = ?, emcf_status = ?, emcf_code_mec_e_f_dgi = ?, emcf_qr_code = ?, emcf_date_time = ?, emcf_counters = ?, emcf_nim = ?, emcf_pos_id = ?, emcf_raw_response = ?, emcf_submitted_at = ?, emcf_confirmed_at = ? WHERE id = ?'
      )
        .run(
          updated.invoice_number ?? updated.invoiceNumber,
          updated.date,
          updated.client_snapshot ?? updated.clientSnapshot,
          updated.product_snapshot ?? updated.productSnapshot,
          updated.total_price ?? updated.totalPrice,
          updated.tva,
          updated.ifu,
          updated.immutable_flag ?? (updated.immutableFlag ? 1 : 0),
          invoiceType,
          originalInvoiceReference,
          aibRate,
          paymentMethods,
          updated.emcf_uid ?? updated.emcfUid,
          updated.emcf_status ?? updated.emcfStatus,
          emcfCode,
          updated.emcf_qr_code ?? updated.emcfQrCode,
          updated.emcf_date_time ?? updated.emcfDateTime,
          updated.emcf_counters ?? (updated.emcfCounters ? (typeof updated.emcfCounters === 'string' ? updated.emcfCounters : JSON.stringify(updated.emcfCounters)) : null),
          updated.emcf_nim ?? updated.emcfNim,
          updated.emcf_pos_id ?? updated.emcfPosId,
          updated.emcf_raw_response ?? (updated.emcfRawResponse ? (typeof updated.emcfRawResponse === 'string' ? updated.emcfRawResponse : JSON.stringify(updated.emcfRawResponse)) : null),
          updated.emcf_submitted_at ?? updated.emcfSubmittedAt,
          updated.emcf_confirmed_at ?? updated.emcfConfirmedAt,
          id
        );
      return db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    },
    deleteInvoice: (id) => {
      const row = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
      if (!row) return false;
      if (row.immutable_flag === 1) throw new Error('Invoice is immutable and cannot be deleted');
      db.prepare('DELETE FROM invoices WHERE id = ?').run(id);
      return true;
    },
    // Backups: create a timestamped copy of the SQLite DB and restore from file
    backupDatabase: () => {
      try {
        const userDataPath = app.getPath('userData');
        const appDir = path.join(userDataPath, 'vin-chef');
        const dbPath = path.join(appDir, 'data.sqlite');
        const backupsDir = path.join(appDir, 'backups');
        if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
        const now = new Date();
        const stamp = now.toISOString().replace(/[:.]/g, '-');
        const dest = path.join(backupsDir, `data-${stamp}.sqlite`);
        // flush WAL if used
        try { db.exec('PRAGMA wal_checkpoint(FULL)'); } catch (e) {}
        fs.copyFileSync(dbPath, dest);
        return { success: true, path: dest };
      } catch (err) {
        console.error('backupDatabase error', err);
        return { success: false, error: String(err) };
      }
    },
    // List available backup files
    listBackups: () => {
      try {
        const userDataPath = app.getPath('userData');
        const backupsDir = path.join(userDataPath, 'vin-chef', 'backups');
        if (!fs.existsSync(backupsDir)) return [];
        const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.sqlite')).map(f => path.join(backupsDir, f));
        return files.sort().reverse();
      } catch (err) {
        console.error('listBackups error', err);
        return [];
      }
    },
    restoreDatabase: (backupPath) => {
      try {
        const userDataPath = app.getPath('userData');
        const appDir = path.join(userDataPath, 'vin-chef');
        const dbPath = path.join(appDir, 'data.sqlite');
        if (!fs.existsSync(backupPath)) return { success: false, error: 'backup not found' };
        // close current DB connection
        try { db.close(); } catch (e) {}
        fs.copyFileSync(backupPath, dbPath);
        // reopen DB
        db = new Database(dbPath);
        ensureSchema();
        return { success: true };
      } catch (err) {
        console.error('restoreDatabase error', err);
        return { success: false, error: String(err) };
      }
    },
    // Reset DB to demo data (clear key tables and reseed)
    resetDemoData: () => {
      const now = new Date().toISOString();
      // clear tables
      db.prepare('DELETE FROM invoices').run();
      db.prepare('DELETE FROM sales').run();
      db.prepare('DELETE FROM products').run();
      db.prepare('DELETE FROM clients').run();
      db.prepare('DELETE FROM users').run();
      db.prepare('UPDATE invoice_counter SET counter = 0 WHERE id = 1').run();

      // reseed users
      const users = [
        { id: '1', username: 'admin', password: 'admin123', role: 'admin' },
        { id: '2', username: 'commercial', password: 'demo123', role: 'commercial' },
      ];
      const insertUser = db.prepare('INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)');
      for (const u of users) {
        const hash = require('bcryptjs').hashSync(u.password, 10);
        insertUser.run(u.id, u.username, hash, u.role, now);
      }

      // reseed products
      const insertP = db.prepare('INSERT INTO products (id, name, category, unit_price, stock_quantity, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
      insertP.run('1', 'Château Margaux 2015', 'Bordeaux Rouge', 450000, 12, 'Premier Grand Cru Classé', now);
      insertP.run('2', 'Meursault 1er Cru 2018', 'Bourgogne Blanc', 280000, 24, 'Vin blanc sec de Bourgogne', now);
      insertP.run('3', 'Champagne Dom Pérignon 2012', 'Champagne', 650000, 18, 'Champagne prestige', now);

      // reseed clients
      const insertC = db.prepare('INSERT INTO clients (id, name, contact_info, email, phone, address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
      insertC.run('1', 'Restaurant Le Gourmet', '+229 97 00 00 01', 'contact@legourmet.bj', '+229 97 00 00 01', 'Cotonou, Bénin', now);
      insertC.run('2', 'Hôtel Royal Palace', '+229 97 00 00 02', 'achats@royalpalace.bj', '+229 97 00 00 02', 'Porto-Novo, Bénin', now);

      return true;
    },
    // Audit logging
    addAudit: (action, entity, entityId, userId, meta) => {
      try {
        const now = new Date().toISOString();
        db.prepare('CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, action TEXT, entity TEXT, entity_id TEXT, user_id TEXT, meta TEXT, created_at TEXT)')
          .run();
        const id = Date.now().toString() + Math.random().toString(36).slice(2,8);
        db.prepare('INSERT INTO audit_logs (id, action, entity, entity_id, user_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, action, entity, entityId, userId || null, meta ? JSON.stringify(meta) : null, now);
        return true;
      } catch (err) {
        console.error('addAudit error', err);
        return false;
      }
    },
    // List audit logs (new)
    listAudits: () => {
      try {
        db.prepare('CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, action TEXT, entity TEXT, entity_id TEXT, user_id TEXT, meta TEXT, created_at TEXT)')
          .run();
        const rows = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1000').all();
        return rows.map(r => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : null }));
      } catch (err) {
        console.error('listAudits error', err);
        return [];
      }
    },

    listEmcfPointsOfSale: () => {
      const rows = db.prepare('SELECT id, name, base_url, token, token_encrypted, is_active, created_at, updated_at FROM emcf_points_of_sale ORDER BY created_at DESC').all();
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        baseUrl: r.base_url,
        hasToken: Boolean(r.token),
        tokenEncrypted: r.token_encrypted === 1,
        isActive: r.is_active === 1,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    },
    upsertEmcfPointOfSale: (pos) => {
      const now = new Date().toISOString();
      const existing = db.prepare('SELECT * FROM emcf_points_of_sale WHERE id = ?').get(pos.id);
      const nextTokenPlain = typeof pos.token === 'string' ? pos.token : null;
      const nextTokenEncrypted = nextTokenPlain ? encryptSecret(nextTokenPlain) : null;
      const tokenEncryptedFlag = nextTokenPlain ? (getSafeStorage() && getSafeStorage().isEncryptionAvailable() ? 1 : 0) : (existing ? existing.token_encrypted : 1);
      if (existing) {
        const finalToken = nextTokenEncrypted !== null ? nextTokenEncrypted : existing.token;
        db.prepare('UPDATE emcf_points_of_sale SET name = ?, base_url = ?, token = ?, token_encrypted = ?, updated_at = ? WHERE id = ?')
          .run(pos.name, pos.baseUrl, finalToken, tokenEncryptedFlag, now, pos.id);
      } else {
        db.prepare('INSERT INTO emcf_points_of_sale (id, name, base_url, token, token_encrypted, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)')
          .run(pos.id, pos.name, pos.baseUrl, nextTokenEncrypted, tokenEncryptedFlag, now, now);
      }
      return db.prepare('SELECT id, name, base_url, is_active, created_at, updated_at FROM emcf_points_of_sale WHERE id = ?').get(pos.id);
    },
    deleteEmcfPointOfSale: (id) => {
      db.prepare('DELETE FROM emcf_points_of_sale WHERE id = ?').run(id);
      return true;
    },
    setActiveEmcfPointOfSale: (id) => {
      const tx = db.transaction((posId) => {
        db.prepare('UPDATE emcf_points_of_sale SET is_active = 0').run();
        db.prepare('UPDATE emcf_points_of_sale SET is_active = 1 WHERE id = ?').run(posId);
      });
      tx(id);
      return true;
    },
    getActiveEmcfPointOfSale: () => {
      const r = db.prepare('SELECT id, name, base_url, token, token_encrypted, is_active, created_at, updated_at FROM emcf_points_of_sale WHERE is_active = 1 LIMIT 1').get();
      if (!r) return null;
      return {
        id: r.id,
        name: r.name,
        baseUrl: r.base_url,
        hasToken: Boolean(r.token),
        tokenEncrypted: r.token_encrypted === 1,
        isActive: r.is_active === 1,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    },
    getActiveEmcfCredentials: () => {
      const r = db.prepare('SELECT base_url, token, token_encrypted FROM emcf_points_of_sale WHERE is_active = 1 LIMIT 1').get();
      if (!r) return null;
      const token = r.token_encrypted === 1 ? decryptSecret(r.token) : (r.token ? String(r.token) : null);
      return { baseUrl: r.base_url, token };
    },
    getEmcfCredentialsByPosId: (posId) => {
      if (!posId) return null;
      const r = db.prepare('SELECT base_url, token, token_encrypted FROM emcf_points_of_sale WHERE id = ? LIMIT 1').get(posId);
      if (!r) return null;
      const token = r.token_encrypted === 1 ? decryptSecret(r.token) : (r.token ? String(r.token) : null);
      return { baseUrl: r.base_url, token };
    },
  };
}

module.exports = { init };
