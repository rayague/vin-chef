const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

let db;

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
      db.prepare('INSERT INTO products (id, name, category, unit_price, stock_quantity, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(product.id, product.name, product.category || null, product.unitPrice, product.stockQuantity, product.description || null, now);
      return db.prepare('SELECT * FROM products WHERE id = ?').get(product.id);
    },
    updateProduct: (id, updates) => {
      const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates, updated_at: new Date().toISOString() };
      db.prepare('UPDATE products SET name = ?, category = ?, unit_price = ?, stock_quantity = ?, description = ?, updated_at = ? WHERE id = ?')
        .run(updated.name, updated.category, updated.unit_price ?? updated.unitPrice, updated.stock_quantity ?? updated.stockQuantity, updated.description, updated.updated_at, id);
      return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    },
    deleteProduct: (id) => db.prepare('DELETE FROM products WHERE id = ?').run(id),

    // Clients
    getClients: () => db.prepare('SELECT * FROM clients').all(),
    addClient: (client) => {
      const now = new Date().toISOString();
      db.prepare('INSERT INTO clients (id, name, contact_info, email, phone, address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(client.id, client.name, client.contactInfo || null, client.email || null, client.phone || null, client.address || null, now);
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
      db.prepare('UPDATE clients SET name = ?, contact_info = ?, email = ?, phone = ?, address = ? WHERE id = ?')
        .run(updated.name, updated.contact_info ?? updated.contactInfo, updated.email, updated.phone, updated.address, id);
      return db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    },
    deleteClient: (id) => db.prepare('DELETE FROM clients WHERE id = ?').run(id),

    // Sales
    addSale: (sale) => {
      const now = new Date().toISOString();
      const insert = db.prepare('INSERT INTO sales (id, product_id, client_id, quantity, unit_price, total_price, date, invoice_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      insert.run(sale.id, sale.productId, sale.clientId || null, sale.quantity, sale.unitPrice, sale.totalPrice, sale.date, sale.invoiceId || null, sale.createdBy || null, now);

      // decrement stock
      db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?').run(sale.quantity, sale.productId);
      return db.prepare('SELECT * FROM sales WHERE id = ?').get(sale.id);
    },
    getSales: () => db.prepare('SELECT * FROM sales').all(),

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
      db.prepare('INSERT INTO invoices (id, invoice_number, sale_id, date, client_snapshot, product_snapshot, total_price, tva, ifu, immutable_flag, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(invoice.id, invoice.invoiceNumber, invoice.saleId || null, invoice.date, invoice.clientSnapshot || null, invoice.productSnapshot || null, invoice.totalPrice, invoice.tva || 0, invoice.ifu || null, invoice.immutableFlag ? 1 : 0, now);
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
        db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?').run(s.quantity, s.productId);
        // insert invoice
        db.prepare('INSERT INTO invoices (id, invoice_number, sale_id, date, client_snapshot, product_snapshot, total_price, tva, ifu, immutable_flag, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(i.id, i.invoiceNumber, s.id, i.date, i.clientSnapshot || null, i.productSnapshot || null, i.totalPrice, i.tva || 0, i.ifu || null, i.immutableFlag ? 1 : 0, now);
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
    getInvoices: () => db.prepare('SELECT * FROM invoices').all(),
    updateInvoice: (id, updates) => {
      const row = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
      if (!row) return null;
      if (row.immutable_flag === 1) throw new Error('Invoice is immutable and cannot be modified');
      const updated = { ...row, ...updates };
      db.prepare('UPDATE invoices SET invoice_number = ?, date = ?, client_snapshot = ?, product_snapshot = ?, total_price = ?, tva = ?, ifu = ?, immutable_flag = ? WHERE id = ?')
        .run(updated.invoice_number ?? updated.invoiceNumber, updated.date, updated.client_snapshot ?? updated.clientSnapshot, updated.product_snapshot ?? updated.productSnapshot, updated.total_price ?? updated.totalPrice, updated.tva, updated.ifu, updated.immutable_flag ?? (updated.immutableFlag ? 1 : 0), id);
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
  };
}

module.exports = { init };
