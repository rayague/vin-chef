const fs = require('node:fs');
const path = require('node:path');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function timestampForFilename(d = new Date()) {
  // YYYY-MM-DD_HH-MM-SS
  return [
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    `${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`,
  ].join('_');
}

function ensureDirSync(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function takeScreenshot(page, opts) {
  const {
    baseDir,
    testId,
    step,
    label,
    fullPage = true,
  } = opts;

  const safeLabel = String(label)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '');

  const dir = path.join(baseDir, testId);
  ensureDirSync(dir);

  const fileName = `${timestampForFilename()}_${String(step).padStart(2, '0')}_${safeLabel}.png`;
  const filePath = path.join(dir, fileName);

  await page.screenshot({ path: filePath, fullPage });

  return {
    fileName,
    filePath,
    relPath: path.join(testId, fileName).replace(/\\/g, '/'),
  };
}

module.exports = {
  takeScreenshot,
  ensureDirSync,
  timestampForFilename,
};
