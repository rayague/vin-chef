module.exports = {
  // Environnements
  test: {
    url: 'https://developper.impots.bj/sygmef-test',
    ifu: 'TON_IFU',
    password: 'TON_MOT_DE_PASSE',
  },
  production: {
    url: 'https://sygmef.impots.bj',
    ifu: 'TON_IFU',
    password: 'TON_MOT_DE_PASSE',
  },

  // Paramètres tests
  timeoutMs: 30_000,
  headless: false,
  slowMoMs: 60,

  screenshotDir: 'screenshots',
  reportsDir: 'reports',

  // Données de test
  testClient: {
    ifu: '0202368226611',
    name: 'Client Test SA',
    address: '123 Rue Test, Cotonou',
  },
  testItems: [
    { name: 'Produit A', price: 1000, taxGroup: 'TVA18' },
    { name: 'Produit B', price: 5000, taxGroup: 'TVA18' },
  ],
};
