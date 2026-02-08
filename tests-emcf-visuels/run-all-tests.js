const path = require('node:path');
const { spawn } = require('node:child_process');

const tests = [
  'tests-individuels/01-connexion-sygmef.js',
  // Ajoute ici les tests 02..15 quand ils seront créés
];

async function run() {
  let failed = 0;

  for (const t of tests) {
    // eslint-disable-next-line no-console
    console.log(`\n=== RUN ${t} ===`);

    await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.resolve(__dirname, t)], {
        stdio: 'inherit',
        env: { ...process.env },
      });

      child.on('exit', (code) => {
        if (code !== 0) failed += 1;
        resolve();
      });
    });
  }

  if (failed > 0) {
    // eslint-disable-next-line no-console
    console.error(`\n${failed} test(s) en échec.`);
    process.exitCode = 1;
  } else {
    // eslint-disable-next-line no-console
    console.log('\nTous les tests ont réussi.');
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Runner error', err);
  process.exitCode = 1;
});
