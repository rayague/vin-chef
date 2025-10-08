const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const dbModule = require('./db.cjs');

let dbApi;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Open the DevTools if in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  // initialize DB
  dbApi = dbModule.init(app);

  // Register IPC handlers mapping to dbApi methods with safe wrappers
  ipcMain.handle('db.getProducts', async () => dbApi.getProducts());
  ipcMain.handle('db.getClients', async () => dbApi.getClients());
  ipcMain.handle('db.getSales', async () => dbApi.getSales());
  ipcMain.handle('db.getInvoices', async () => dbApi.getInvoices());
  ipcMain.handle('db.getUserByUsername', async (event, username) => dbApi.getUserByUsername(username));
  ipcMain.handle('db.getNextInvoiceNumber', async () => dbApi.getNextInvoiceNumber());
  ipcMain.handle('db.resetDemoData', async () => {
    try {
      return dbApi.resetDemoData();
    } catch (err) {
      console.error('db.resetDemoData error', err);
      return false;
    }
  });
  // Write handlers
  ipcMain.handle('db.addProduct', async (event, product) => dbApi.addProduct(product));
  ipcMain.handle('db.updateProduct', async (event, id, updates) => dbApi.updateProduct(id, updates));
  ipcMain.handle('db.deleteProduct', async (event, id) => dbApi.deleteProduct(id));
  ipcMain.handle('db.addClient', async (event, client) => dbApi.addClient(client));
  ipcMain.handle('db.updateClient', async (event, id, updates) => dbApi.updateClient(id, updates));
  ipcMain.handle('db.deleteClient', async (event, id) => dbApi.deleteClient(id));
  ipcMain.handle('db.addSale', async (event, sale) => dbApi.addSale(sale));
  // atomic sale + invoice
  ipcMain.handle('db.createSaleWithInvoice', async (event, sale, invoice) => {
    try {
      if (typeof dbApi.createSaleWithInvoice === 'function') return dbApi.createSaleWithInvoice(sale, invoice);
      // fallback: try sequential
      const s = dbApi.addSale(sale);
      const inv = dbApi.createInvoice ? dbApi.createInvoice(invoice) : dbApi.addInvoice ? dbApi.addInvoice(invoice) : null;
      return { sale: s, invoice: inv };
    } catch (err) {
      console.error('db.createSaleWithInvoice error', err);
      throw err;
    }
  });
  // db.cjs implements createInvoice named method; make handler call it
  ipcMain.handle('db.addInvoice', async (event, invoice) => dbApi.createInvoice ? dbApi.createInvoice(invoice) : dbApi.addInvoice ? dbApi.addInvoice(invoice) : null);
  // Categories
  ipcMain.handle('db.getCategories', async () => dbApi.getCategories());
  ipcMain.handle('db.addCategory', async (event, category) => dbApi.addCategory(category));
  ipcMain.handle('db.updateCategory', async (event, id, updates) => dbApi.updateCategory(id, updates));
  ipcMain.handle('db.deleteCategory', async (event, id) => dbApi.deleteCategory(id));
  // users management
  ipcMain.handle('db.getUsers', async () => {
    try {
      return dbApi.getUsers ? dbApi.getUsers() : [];
    } catch (err) {
      console.error('db.getUsers error', err);
      return [];
    }
  });
  ipcMain.handle('db.addUser', async (event, user) => dbApi.addUser ? dbApi.addUser(user) : null);
  ipcMain.handle('db.updateUser', async (event, id, updates) => dbApi.updateUser ? dbApi.updateUser(id, updates) : null);
  ipcMain.handle('db.deleteUser', async (event, id) => dbApi.deleteUser ? dbApi.deleteUser(id) : null);
  // invoices: update/delete with immutability enforcement
  ipcMain.handle('db.updateInvoice', async (event, id, updates) => {
    try {
      if (typeof dbApi.updateInvoice === 'function') return dbApi.updateInvoice(id, updates);
      throw new Error('updateInvoice not supported');
    } catch (err) {
      console.error('db.updateInvoice error', err);
      throw err;
    }
  });
  ipcMain.handle('db.deleteInvoice', async (event, id) => {
    try {
      if (typeof dbApi.deleteInvoice === 'function') return dbApi.deleteInvoice(id);
      throw new Error('deleteInvoice not supported');
    } catch (err) {
      console.error('db.deleteInvoice error', err);
      throw err;
    }
  });

  // Backup / Restore handlers
  ipcMain.handle('db.backupDatabase', async () => {
    try {
      if (typeof dbApi.backupDatabase === 'function') {
        return await dbApi.backupDatabase();
      }
      return { success: false, error: 'backup not supported' };
    } catch (err) {
      console.error('db.backupDatabase error', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('db.restoreDatabase', async (event, backupPath) => {
    try {
      if (typeof dbApi.restoreDatabase === 'function') {
        return await dbApi.restoreDatabase(backupPath);
      }
      return { success: false, error: 'restore not supported' };
    } catch (err) {
      console.error('db.restoreDatabase error', err);
      return { success: false, error: String(err) };
    }
  });

  // list backups
  ipcMain.handle('db.listBackups', async () => {
    try {
      if (typeof dbApi.listBackups === 'function') return dbApi.listBackups();
      return [];
    } catch (err) {
      console.error('db.listBackups error', err);
      return [];
    }
  });

  // list audits
  ipcMain.handle('db.listAudits', async () => {
    try {
      if (typeof dbApi.listAudits === 'function') return dbApi.listAudits();
      return [];
    } catch (err) {
      console.error('db.listAudits error', err);
      return [];
    }
  });

  // audit
  ipcMain.handle('db.addAudit', async (event, action, entity, entityId, userId, meta) => {
    try {
      if (typeof dbApi.addAudit === 'function') return dbApi.addAudit(action, entity, entityId, userId, meta);
      return false;
    } catch (err) {
      console.error('db.addAudit error', err);
      return false;
    }
  });

  // Authentication handler: validate credentials against DB (bcrypt)
  ipcMain.handle('auth.login', async (event, username, password) => {
    try {
      console.debug('auth.login attempt for username:', username);
      const user = dbApi.getUserByUsername(username);
      if (!user) {
        console.debug('auth.login: user not found for', username);
      }
      if (!user) return { success: false };
      const bcrypt = require('bcryptjs');
      const isValid = await bcrypt.compare(password, user.password_hash);
      console.debug('auth.login: password comparison result for', username, isValid);
      if (!isValid) return { success: false };
      // Do not send password hash to renderer
      const safeUser = { id: user.id, username: user.username, role: user.role };
      return { success: true, user: safeUser };
    } catch (err) {
      console.error('auth.login error', err);
      return { success: false };
    }
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
