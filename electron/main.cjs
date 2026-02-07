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

  const joinUrl = (baseUrl, p) => {
    const b = String(baseUrl || '').replace(/\/+$/, '');
    const pathPart = String(p || '').startsWith('/') ? String(p || '') : `/${String(p || '')}`;
    return `${b}${pathPart}`;
  };

  const normalizeInvoiceBaseUrl = (baseUrl) => {
    const b = String(baseUrl || '').replace(/\/+$/, '');
    if (!b) return '';
    // Official SDK endpoints are under /api/invoice
    if (b.endsWith('/api/invoice')) return b;
    // Backward compatibility with older configs
    if (b.endsWith('/invoice')) return joinUrl(b.replace(/\/invoice$/, ''), '/api/invoice');
    return joinUrl(b, '/api/invoice');
  };

  const fetchJson = async ({ url, method, token, body, timeoutMs = 25000 }) => {
    if (typeof fetch !== 'function') throw new Error('fetch is not available in this Electron runtime');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });

      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        data = text;
      }

      if (!res.ok) {
        const msg = typeof data === 'string' ? data : (data && data.message ? data.message : `HTTP ${res.status}`);
        const err = new Error(msg);
        err.status = res.status;
        err.payload = data;
        throw err;
      }

      return data;
    } finally {
      clearTimeout(t);
    }
  };

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

  // e-MCF (DGI) POS management (never return token to renderer)
  ipcMain.handle('emcf.listPointsOfSale', async () => {
    try {
      if (typeof dbApi.listEmcfPointsOfSale !== 'function') return [];
      return dbApi.listEmcfPointsOfSale();
    } catch (err) {
      console.error('emcf.listPointsOfSale error', err);
      return [];
    }
  });

  ipcMain.handle('emcf.upsertPointOfSale', async (event, pos) => {
    if (typeof dbApi.upsertEmcfPointOfSale !== 'function') throw new Error('e-MCF POS upsert not supported');
    return dbApi.upsertEmcfPointOfSale(pos);
  });

  ipcMain.handle('emcf.deletePointOfSale', async (event, id) => {
    if (typeof dbApi.deleteEmcfPointOfSale !== 'function') throw new Error('e-MCF POS delete not supported');
    return dbApi.deleteEmcfPointOfSale(id);
  });

  ipcMain.handle('emcf.setActivePointOfSale', async (event, id) => {
    if (typeof dbApi.setActiveEmcfPointOfSale !== 'function') throw new Error('e-MCF POS activation not supported');
    return dbApi.setActiveEmcfPointOfSale(id);
  });

  ipcMain.handle('emcf.getActivePointOfSale', async () => {
    try {
      if (typeof dbApi.getActiveEmcfPointOfSale !== 'function') return null;
      return dbApi.getActiveEmcfPointOfSale();
    } catch (err) {
      console.error('emcf.getActivePointOfSale error', err);
      return null;
    }
  });

  // e-MCF (DGI) API calls
  const normalizeEnvToken = (token) => {
    const raw = String(token || '').trim();
    if (!raw) return '';
    return raw.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : raw;
  };

  const getCredsFromDb = (posId) => {
    if (posId && typeof dbApi.getEmcfCredentialsByPosId === 'function') return dbApi.getEmcfCredentialsByPosId(posId);
    if (typeof dbApi.getActiveEmcfCredentials === 'function') return dbApi.getActiveEmcfCredentials();
    return null;
  };

  const resolveEmcfCreds = (posId) => {
    const dbCreds = getCredsFromDb(posId);

    const envModeRaw = String(process.env.EMCF_CREDENTIALS_MODE || '').trim().toLowerCase();
    const envMode = envModeRaw === 'override' || envModeRaw === 'fallback' ? envModeRaw : 'fallback';

    const envBaseUrl = String(process.env.EMCF_BASE_URL || '').trim();
    const envToken = normalizeEnvToken(process.env.EMCF_TOKEN);
    const hasEnv = !!envBaseUrl || !!envToken;

    if (!hasEnv) return dbCreds;

    if (envMode === 'override') {
      return {
        ...(dbCreds || {}),
        ...(envBaseUrl ? { baseUrl: envBaseUrl } : {}),
        ...(envToken ? { token: envToken } : {}),
      };
    }

    // fallback: only fill missing pieces from env
    return {
      ...(dbCreds || {}),
      ...(!dbCreds?.baseUrl && envBaseUrl ? { baseUrl: envBaseUrl } : {}),
      ...(!dbCreds?.token && envToken ? { token: envToken } : {}),
    };
  };

  ipcMain.handle('emcf.submitInvoice', async (event, payload, options) => {
    const posId = options && options.posId ? options.posId : null;
    const creds = resolveEmcfCreds(posId);
    if (!creds || !creds.baseUrl) throw new Error('e-MCF is not configured (missing base URL)');
    if (!creds.token) throw new Error('e-MCF is not configured (missing token)');
    const invoiceBaseUrl = normalizeInvoiceBaseUrl(creds.baseUrl);
    return fetchJson({ url: invoiceBaseUrl, method: 'POST', token: creds.token, body: payload });
  });

  const finalizeInvoice = async ({ uid, action, posId }) => {
    const creds = resolveEmcfCreds(posId);
    if (!creds || !creds.baseUrl) throw new Error('e-MCF is not configured (missing base URL)');
    if (!creds.token) throw new Error('e-MCF is not configured (missing token)');
    const invoiceBaseUrl = normalizeInvoiceBaseUrl(creds.baseUrl);
    const safeUid = encodeURIComponent(uid);
    const safeAction = encodeURIComponent(action);
    const url = joinUrl(invoiceBaseUrl, `/${safeUid}/${safeAction}`);
    try {
      return await fetchJson({ url, method: 'POST', token: creds.token });
    } catch (err) {
      const status = err && typeof err.status === 'number' ? err.status : null;
      if (status === 404 || status === 405) {
        try {
          return await fetchJson({ url, method: 'PUT', token: creds.token });
        } catch (err2) {
          const status2 = err2 && typeof err2.status === 'number' ? err2.status : null;
          if (status2 === 404 || status2 === 405) {
            // Some deployments may use French action names
            if (action === 'confirm') {
              return finalizeInvoice({ uid, action: 'confirmer', posId });
            }
            if (action === 'cancel') {
              return finalizeInvoice({ uid, action: 'annuler', posId });
            }
          }
          throw err2;
        }
      }
      throw err;
    }
  };

  ipcMain.handle('emcf.finalizeInvoice', async (event, uid, action, options) => {
    const posId = options && options.posId ? options.posId : null;
    if (!uid) throw new Error('UID is required');
    if (!action) throw new Error('Action is required');
    return finalizeInvoice({ uid, action, posId });
  });

  // backward-compatible alias (confirm)
  ipcMain.handle('emcf.confirmInvoice', async (event, uid, options) => {
    const posId = options && options.posId ? options.posId : null;
    return finalizeInvoice({ uid, action: 'confirm', posId });
  });

  ipcMain.handle('emcf.getInvoice', async (event, uid, options) => {
    const posId = options && options.posId ? options.posId : null;
    const creds = resolveEmcfCreds(posId);
    if (!creds || !creds.baseUrl) throw new Error('e-MCF is not configured (missing base URL)');
    if (!creds.token) throw new Error('e-MCF is not configured (missing token)');
    const invoiceBaseUrl = normalizeInvoiceBaseUrl(creds.baseUrl);
    return fetchJson({ url: joinUrl(invoiceBaseUrl, `/${encodeURIComponent(uid)}`), method: 'GET', token: creds.token });
  });

  ipcMain.handle('emcf.status', async (event, options) => {
    const posId = options && options.posId ? options.posId : null;
    const creds = resolveEmcfCreds(posId);
    if (!creds || !creds.baseUrl) throw new Error('e-MCF is not configured (missing base URL)');
    if (!creds.token) throw new Error('e-MCF is not configured (missing token)');
    const invoiceBaseUrl = normalizeInvoiceBaseUrl(creds.baseUrl);
    return fetchJson({ url: invoiceBaseUrl, method: 'GET', token: creds.token });
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
