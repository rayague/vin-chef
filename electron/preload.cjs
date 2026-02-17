const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  db: {
    getProducts: () => ipcRenderer.invoke('db.getProducts'),
    getClients: () => ipcRenderer.invoke('db.getClients'),
    getSales: () => ipcRenderer.invoke('db.getSales'),
    getInvoices: () => ipcRenderer.invoke('db.getInvoices'),
    getUserByUsername: (username) => ipcRenderer.invoke('db.getUserByUsername', username),
    getNextInvoiceNumber: () => ipcRenderer.invoke('db.getNextInvoiceNumber'),
    resetDemoData: () => ipcRenderer.invoke('db.resetDemoData'),
    resetSalesAndInvoices: (options) => ipcRenderer.invoke('db.resetSalesAndInvoices', options),
    resetProductCatalog: () => ipcRenderer.invoke('db.resetProductCatalog'),
    // Write operations
    addProduct: (product) => ipcRenderer.invoke('db.addProduct', product),
    updateProduct: (id, updates) => ipcRenderer.invoke('db.updateProduct', id, updates),
    deleteProduct: (id) => ipcRenderer.invoke('db.deleteProduct', id),
    addClient: (client) => ipcRenderer.invoke('db.addClient', client),
    updateClient: (id, updates) => ipcRenderer.invoke('db.updateClient', id, updates),
    deleteClient: (id) => ipcRenderer.invoke('db.deleteClient', id),
    addSale: (sale) => ipcRenderer.invoke('db.addSale', sale),
  addInvoice: (invoice) => ipcRenderer.invoke('db.addInvoice', invoice),
  createSaleWithInvoice: (sale, invoice) => ipcRenderer.invoke('db.createSaleWithInvoice', sale, invoice),
    // Categories
    getCategories: () => ipcRenderer.invoke('db.getCategories'),
    addCategory: (category) => ipcRenderer.invoke('db.addCategory', category),
    updateCategory: (id, updates) => ipcRenderer.invoke('db.updateCategory', id, updates),
    deleteCategory: (id) => ipcRenderer.invoke('db.deleteCategory', id),
    // Backup / Restore
    backupDatabase: () => ipcRenderer.invoke('db.backupDatabase'),
    getDatabaseInfo: () => ipcRenderer.invoke('db.getDatabaseInfo'),
    exportDatabaseAs: () => ipcRenderer.invoke('db.exportDatabaseAs'),
    restoreDatabase: (backupPath) => ipcRenderer.invoke('db.restoreDatabase', backupPath),
    pickRestoreFile: () => ipcRenderer.invoke('db.pickRestoreFile'),
  listBackups: () => ipcRenderer.invoke('db.listBackups'),
    listAudits: () => ipcRenderer.invoke('db.listAudits'),
  addAudit: (action, entity, entityId, userId, meta) => ipcRenderer.invoke('db.addAudit', action, entity, entityId, userId, meta),
  // Users
  getUsers: () => ipcRenderer.invoke('db.getUsers'),
  addUser: (user) => ipcRenderer.invoke('db.addUser', user),
  updateUser: (id, updates) => ipcRenderer.invoke('db.updateUser', id, updates),
  deleteUser: (id) => ipcRenderer.invoke('db.deleteUser', id),
    // invoices
    updateInvoice: (id, updates) => ipcRenderer.invoke('db.updateInvoice', id, updates),
    deleteInvoice: (id) => ipcRenderer.invoke('db.deleteInvoice', id),
    // Stock movements
    getStockMovements: () => ipcRenderer.invoke('db.getStockMovements'),
    addStockMovement: (movement) => ipcRenderer.invoke('db.addStockMovement', movement),
  },
  emcf: {
    listPointsOfSale: () => ipcRenderer.invoke('emcf.listPointsOfSale'),
    upsertPointOfSale: (pos) => ipcRenderer.invoke('emcf.upsertPointOfSale', pos),
    deletePointOfSale: (id) => ipcRenderer.invoke('emcf.deletePointOfSale', id),
    setActivePointOfSale: (id) => ipcRenderer.invoke('emcf.setActivePointOfSale', id),
    getActivePointOfSale: () => ipcRenderer.invoke('emcf.getActivePointOfSale'),
    submitInvoice: (payload, options) => ipcRenderer.invoke('emcf.submitInvoice', payload, options),
    finalizeInvoice: (uid, action, options) => ipcRenderer.invoke('emcf.finalizeInvoice', uid, action, options),
    confirmInvoice: (uid, options) => ipcRenderer.invoke('emcf.confirmInvoice', uid, options),
    getInvoice: (uid, options) => ipcRenderer.invoke('emcf.getInvoice', uid, options),
    status: (options) => ipcRenderer.invoke('emcf.status', options),
  },
  auth: {
    login: (username, password) => ipcRenderer.invoke('auth.login', username, password),
    ping: () => ipcRenderer.invoke('ping'),
  }
});
