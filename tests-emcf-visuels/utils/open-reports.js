const path = require('node:path');
const { exec } = require('node:child_process');

const reportsDir = path.resolve(__dirname, '..', 'reports');

const cmd = process.platform === 'win32'
  ? `start "" "${reportsDir}"`
  : process.platform === 'darwin'
    ? `open "${reportsDir}"`
    : `xdg-open "${reportsDir}"`;

exec(cmd, (err) => {
  if (err) {
    // eslint-disable-next-line no-console
    console.error('Impossible d\'ouvrir le dossier reports:', err);
    process.exitCode = 1;
  }
});
