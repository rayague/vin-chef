const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch (e) {
  autoUpdater = null;
}

console.log('[main] boot: vin-chef electron/main.cjs loaded (emcf-uid-debug-2026-02-15)');

const dbModule = require('./db.cjs');
let dbApi;

let mainWindow = null;

console.log('[main] boot', { file: __filename, pid: process.pid, nodeEnv: process.env.NODE_ENV, devServer: process.env.VITE_DEV_SERVER_URL });

function getDbApi() {
  if (!dbApi) dbApi = dbModule.init(app);
  return dbApi;
}

ipcMain.handle('db.getStockMovements', async () => {
  try {
    const api = getDbApi();
    return api.getStockMovements ? api.getStockMovements() : [];
  } catch (err) {
    console.error('db.getStockMovements error', err);
    return [];
  }
});

ipcMain.handle('db.addStockMovement', async (event, movement) => {
  try {
    const api = getDbApi();
    return api.addStockMovement ? api.addStockMovement(movement) : null;
  } catch (err) {
    console.error('db.addStockMovement error', err);
    return null;
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, '..', 'public', 'logo_vin.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('[main] did-fail-load', { errorCode, errorDescription, validatedURL });
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Open the DevTools if in development
  if (process.env.NODE_ENV === 'development' || process.env.VIN_CHEF_DEBUG === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  return mainWindow;
}

function initAutoUpdater() {
  try {
    if (!autoUpdater) return;
    if (!app.isPackaged) return;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    const sendStatus = (payload) => {
      try {
        const win = mainWindow || BrowserWindow.getAllWindows()[0];
        if (!win || win.isDestroyed()) return;
        win.webContents.send('updater:status', payload);
      } catch {
        // ignore
      }
    };

    autoUpdater.on('checking-for-update', () => sendStatus({ state: 'checking-for-update' }));
    autoUpdater.on('update-available', (info) => sendStatus({ state: 'update-available', info }));
    autoUpdater.on('update-not-available', (info) => sendStatus({ state: 'update-not-available', info }));
    autoUpdater.on('error', (err) => {
      const msg = err && err.message ? String(err.message) : 'UNKNOWN_ERROR';
      console.error('[updater] error', msg);
      sendStatus({ state: 'error', error: msg });
    });
    autoUpdater.on('download-progress', (p) => sendStatus({ state: 'download-progress', progress: p }));
    autoUpdater.on('update-downloaded', (info) => {
      sendStatus({ state: 'update-downloaded', info });
      try {
        setTimeout(() => autoUpdater.quitAndInstall(true, true), 750);
      } catch (e) {
        console.error('[updater] quitAndInstall failed', e);
      }
    });

    autoUpdater.checkForUpdates().catch((e) => {
      console.error('[updater] checkForUpdates failed', e);
    });

    const intervalMs = Number(process.env.VIN_CHEF_UPDATE_INTERVAL_MS || 0);
    if (intervalMs && intervalMs > 0) {
      setInterval(() => {
        autoUpdater.checkForUpdates().catch(() => {
          // ignore
        });
      }, intervalMs);
    }
  } catch (err) {
    console.error('[updater] initAutoUpdater failed', err);
  }
}

app.whenReady().then(() => {
  // initialize DB
  dbApi = dbModule.init(app);

  console.log('[main] ready: DB initialized');

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

  ipcMain.handle('db.resetSalesAndInvoices', async (event, options) => {
    try {
      const role = options && options.role ? String(options.role) : '';
      if (role !== 'admin') throw new Error('Forbidden');
      return dbApi.resetSalesAndInvoices ? dbApi.resetSalesAndInvoices() : false;
    } catch (err) {
      console.error('db.resetSalesAndInvoices error', err);
      throw err;
    }
  });

  ipcMain.handle('db.resetProductCatalog', async () => {
    try {
      console.log('[db.resetProductCatalog] IPC called');
      return dbApi.resetProductCatalog ? dbApi.resetProductCatalog() : false;
    } catch (err) {
      console.error('db.resetProductCatalog error', err);
      return false;
    }
  });

  console.log('[main] IPC handlers registered');
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

  // Desktop-only: read-only DB info (path/size/mtime/backups count)
  ipcMain.handle('db.getDatabaseInfo', async () => {
    try {
      const fs = require('fs');
      const userDataPath = app.getPath('userData');
      const appDir = path.join(userDataPath, 'vin-chef');
      const dbPath = path.join(appDir, 'data.sqlite');
      const backupsDir = path.join(appDir, 'backups');

      const exists = fs.existsSync(dbPath);
      let sizeBytes = 0;
      let mtimeIso = null;
      if (exists) {
        const st = fs.statSync(dbPath);
        sizeBytes = Number(st.size || 0);
        mtimeIso = st.mtime ? new Date(st.mtime).toISOString() : null;
      }

      let backupsCount = 0;
      try {
        if (fs.existsSync(backupsDir)) {
          backupsCount = fs.readdirSync(backupsDir).filter((f) => String(f).endsWith('.sqlite')).length;
        }
      } catch (e) {
        backupsCount = 0;
      }

      return {
        success: true,
        exists,
        path: dbPath,
        sizeBytes,
        mtimeIso,
        backupsCount,
      };
    } catch (err) {
      console.error('db.getDatabaseInfo error', err);
      return { success: false, error: String(err) };
    }
  });

  // Desktop-only: export the current SQLite DB to a chosen file path
  ipcMain.handle('db.exportDatabaseAs', async () => {
    try {
      const { dialog } = require('electron');
      const fs = require('fs');
      const win = BrowserWindow.getAllWindows()[0] || null;
      const userDataPath = app.getPath('userData');
      const appDir = path.join(userDataPath, 'vin-chef');
      const dbPath = path.join(appDir, 'data.sqlite');

      const now = new Date();
      const stamp = now.toISOString().replace(/[:.]/g, '-');
      const res = await dialog.showSaveDialog(win, {
        title: 'Exporter la base de données',
        defaultPath: path.join(appDir, `vin-chef-data-${stamp}.sqlite`),
        filters: [{ name: 'SQLite', extensions: ['sqlite', 'db'] }, { name: 'Tous les fichiers', extensions: ['*'] }],
      });

      if (res.canceled || !res.filePath) return { success: false, canceled: true };
      if (!fs.existsSync(dbPath)) return { success: false, error: 'database not found' };

      // best-effort: checkpoint WAL
      try { if (dbApi && typeof dbApi._checkpointWal === 'function') await dbApi._checkpointWal(); } catch (e) { /* ignore */ }

      try { fs.copyFileSync(dbPath, res.filePath); } catch (copyErr) {
        return { success: false, error: String(copyErr) };
      }
      return { success: true, path: String(res.filePath) };
    } catch (err) {
      console.error('db.exportDatabaseAs error', err);
      return { success: false, error: String(err) };
    }
  });

  // Desktop-only: pick a .sqlite file to restore (import database)
  ipcMain.handle('db.pickRestoreFile', async () => {
    try {
      const { dialog } = require('electron');
      const win = BrowserWindow.getAllWindows()[0] || null;
      const res = await dialog.showOpenDialog(win, {
        title: 'Importer une base de données',
        properties: ['openFile'],
        filters: [{ name: 'SQLite', extensions: ['sqlite', 'db'] }, { name: 'Tous les fichiers', extensions: ['*'] }],
      });
      if (res.canceled || !res.filePaths || res.filePaths.length === 0) return { success: false, canceled: true };
      return { success: true, path: String(res.filePaths[0]) };
    } catch (err) {
      console.error('db.pickRestoreFile error', err);
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

  const {
    validateInvoicePayload,
    normalizeEmcfPayload,
    makeSafeLogMeta,
  } = require('./emcf-validation.cjs');

  let emcfInfo = {
    nim: null,
    ifu: null,
    serverDateTime: null,
    lastUpdated: null,
  };

  const updateEmcfInfoFromStatus = (result) => {
    if (!result || !result.nim || !result.ifu) return false;
    emcfInfo = {
      nim: String(result.nim),
      ifu: String(result.ifu),
      serverDateTime: result.serverDateTime ? String(result.serverDateTime) : null,
      lastUpdated: new Date().toISOString(),
    };
    console.log('[e-MCF] Infos stockées:', { nim: emcfInfo.nim, ifu: emcfInfo.ifu });
    return true;
  };

  const refreshEmcfInfoIfExpired = async ({ invoiceBaseUrl, token }) => {
    const refreshMinutes = Number(process.env.EMCF_INFO_REFRESH_MINUTES || 0);
    if (!refreshMinutes || refreshMinutes <= 0) return false;
    if (!emcfInfo.lastUpdated) return false;
    const expired = Date.now() - new Date(emcfInfo.lastUpdated).getTime() > refreshMinutes * 60 * 1000;
    if (!expired) return false;
    try {
      const statusResult = await fetchJson({ url: invoiceBaseUrl, method: 'GET', token });
      return updateEmcfInfoFromStatus(statusResult);
    } catch (err) {
      const msg = err && err.message ? String(err.message) : 'UNKNOWN_ERROR';
      console.warn('[e-MCF] Rafraîchissement infos NIM/IFU échoué:', msg);
      return false;
    }
  };

  ipcMain.handle('emcf.submitInvoice', async (event, payload, options) => {
    console.log('[e-MCF] emcf.submitInvoice invoked (emcf-uid-debug-2026-02-15)');
    const posId = options && options.posId ? options.posId : null;
    const creds = resolveEmcfCreds(posId);
    if (!creds || !creds.baseUrl) throw new Error('e-MCF is not configured (missing base URL)');
    if (!creds.token) throw new Error('e-MCF is not configured (missing token)');
    const invoiceBaseUrl = normalizeInvoiceBaseUrl(creds.baseUrl);

    // If configured, refresh cached NIM/IFU automatically when expired
    await refreshEmcfInfoIfExpired({ invoiceBaseUrl, token: creds.token });

    let normalizedPayload;
    try {
      validateInvoicePayload(payload);
      normalizedPayload = normalizeEmcfPayload(payload, emcfInfo);

      const refreshMinutes = Number(process.env.EMCF_INFO_REFRESH_MINUTES || 0);
      const isExpired =
        !!emcfInfo.lastUpdated &&
        (refreshMinutes > 0
          ? Date.now() - new Date(emcfInfo.lastUpdated).getTime() > refreshMinutes * 60 * 1000
          : false);
      if (!normalizedPayload.nim || !normalizedPayload.ifuVendeur) {
        console.warn('[e-MCF] Attention: NIM ou IFU vendeur manquant (appeler emcf.status recommandé)', {
          hasNim: !!normalizedPayload.nim,
          hasIfuVendeur: !!normalizedPayload.ifuVendeur,
        });
      } else if (isExpired) {
        console.warn('[e-MCF] Attention: infos NIM/IFU potentiellement expirées, rafraîchissement recommandé', {
          lastUpdated: emcfInfo.lastUpdated,
          refreshMinutes,
        });
      }

      const originalType = payload && payload.type ? String(payload.type) : undefined;
      const avRef = normalizedPayload && normalizedPayload.originalInvoiceReference ? String(normalizedPayload.originalInvoiceReference) : undefined;
      console.log('[e-MCF] Payload validé:', {
        ...makeSafeLogMeta(normalizedPayload),
        originalType,
        apiType: normalizedPayload && normalizedPayload.type ? String(normalizedPayload.type) : undefined,
        avRef,
        avRefLen: avRef ? avRef.length : 0,
        hasNim: !!normalizedPayload.nim,
        hasIfuVendeur: !!normalizedPayload.ifuVendeur,
        dateTime: normalizedPayload.dateTime,
      });
    } catch (err) {
      const msg = err && err.message ? String(err.message) : 'VALIDATION_FAILED';
      console.error('[e-MCF] Validation payload échouée:', { error: msg });
      throw new Error(`E_MCF_VALIDATION_FAILED: ${msg}`);
    }

    try {
      const result = await fetchJson({ url: invoiceBaseUrl, method: 'POST', token: creds.token, body: normalizedPayload });

      const extractUid = (r) => {
        if (!r) return null;
        if (typeof r === 'string') return null;
        if (r.uid) return r.uid;
        if (r.UID) return r.UID;
        if (r.id) return r.id;
        if (r.invoiceUid) return r.invoiceUid;
        if (r.invoice_id) return r.invoice_id;
        if (r.data && (r.data.uid || r.data.UID || r.data.id)) return r.data.uid || r.data.UID || r.data.id;
        return null;
      };

      const uid = extractUid(result);
      if (!uid) {
        console.error('[e-MCF] Réponse API sans UID (debug raw response):', result);
        const apiMsg =
          (result && typeof result === 'object' && (result.message || result.error || result.msg))
            ? String(result.message || result.error || result.msg)
            : null;

        let raw;
        try {
          raw = typeof result === 'string' ? result : JSON.stringify(result);
        } catch {
          raw = String(result);
        }

        throw new Error(`API_RETOUR_INVALIDE: Réponse API sans UID${apiMsg ? ` (${apiMsg})` : ''} | raw=${raw}`);
      }

      if (result && typeof result === 'object' && !result.uid) {
        result.uid = uid;
      }

      return result;
    } catch (error) {
      const msg = error && error.message ? String(error.message) : 'UNKNOWN_ERROR';
      console.error('[e-MCF] Erreur soumission:', {
        error: msg,
        payloadType: normalizedPayload && normalizedPayload.type ? normalizedPayload.type : undefined,
        originalType: payload && payload.type ? String(payload.type) : undefined,
        validation: 'FAILED',
        stack: error && error.stack ? String(error.stack) : undefined,
      });
      throw new Error(`E_MCF_SUBMISSION_FAILED: ${msg}`);
    }
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
    try {
      const result = await fetchJson({ url: invoiceBaseUrl, method: 'GET', token: creds.token });
      updateEmcfInfoFromStatus(result);
      return result;
    } catch (error) {
      const msg = error && error.message ? String(error.message) : 'UNKNOWN_ERROR';
      console.error('[e-MCF] Erreur status:', msg);
      throw error;
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
      const isValid = await bcrypt.compare(String(password || ''), String(user.password_hash || ''));
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
  initAutoUpdater();

  ipcMain.handle('updater.checkForUpdates', async () => {
    if (!autoUpdater) return { success: false, error: 'autoUpdater not available' };
    if (!app.isPackaged) return { success: false, error: 'updates disabled in dev' };
    try {
      const res = await autoUpdater.checkForUpdates();
      return { success: true, result: res };
    } catch (err) {
      const msg = err && err.message ? String(err.message) : 'UNKNOWN_ERROR';
      return { success: false, error: msg };
    }
  });

  ipcMain.handle('updater.quitAndInstall', async () => {
    if (!autoUpdater) return { success: false, error: 'autoUpdater not available' };
    if (!app.isPackaged) return { success: false, error: 'updates disabled in dev' };
    try {
      autoUpdater.quitAndInstall(true, true);
      return { success: true };
    } catch (err) {
      const msg = err && err.message ? String(err.message) : 'UNKNOWN_ERROR';
      return { success: false, error: msg };
    }
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
