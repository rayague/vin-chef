const fs = require('node:fs');
const path = require('node:path');

function ensureDirSync(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function createTestRun(testId, meta) {
  return {
    testId,
    startedAt: nowIso(),
    finishedAt: null,
    durationMs: null,
    status: 'RUNNING',
    meta: meta || {},
    steps: [],
    error: null,
  };
}

function logStep(run, step) {
  run.steps.push({
    at: nowIso(),
    ...step,
  });
}

function finishRun(run, status, error) {
  run.finishedAt = nowIso();
  run.status = status;
  const start = new Date(run.startedAt).getTime();
  const end = new Date(run.finishedAt).getTime();
  run.durationMs = Math.max(0, end - start);

  if (error) {
    run.error = {
      message: error && error.message ? String(error.message) : String(error),
      stack: error && error.stack ? String(error.stack) : undefined,
    };
  }
}

function saveTestReport(opts) {
  const { reportsDir, run, screenshotsBaseRel } = opts;

  ensureDirSync(reportsDir);

  const safeId = String(run.testId).replace(/[^a-z0-9\-_.]/gi, '-');
  const jsonPath = path.join(reportsDir, `${safeId}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(run, null, 2), 'utf-8');

  const htmlPath = path.join(reportsDir, `${safeId}.html`);
  fs.writeFileSync(htmlPath, buildHtmlReport(run, screenshotsBaseRel), 'utf-8');

  return { jsonPath, htmlPath };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtmlReport(run, screenshotsBaseRel) {
  const base = screenshotsBaseRel ? String(screenshotsBaseRel).replace(/\\/g, '/') : '';

  const stepsHtml = run.steps
    .map((s, idx) => {
      const shots = (s.screenshots || []).map((shot) => {
        const rel = base ? `${base.replace(/\/$/, '')}/${shot.relPath}` : shot.relPath;
        return `
          <a class="shot" href="../${escapeHtml(rel)}" target="_blank" rel="noreferrer">
            <img src="../${escapeHtml(rel)}" alt="${escapeHtml(shot.label || 'screenshot')}" />
            <div class="caption">${escapeHtml(shot.fileName || '')}</div>
          </a>
        `;
      }).join('\n');

      return `
        <section class="step">
          <div class="step-head">
            <div class="step-title">${idx + 1}. ${escapeHtml(s.title || s.action || 'Étape')}</div>
            <div class="step-time">${escapeHtml(s.at)}</div>
          </div>
          ${s.details ? `<pre class="details">${escapeHtml(JSON.stringify(s.details, null, 2))}</pre>` : ''}
          <div class="shots">${shots}</div>
        </section>
      `;
    })
    .join('\n');

  const errorBlock = run.error
    ? `<section class="error"><h2>Erreur</h2><pre>${escapeHtml(run.error.stack || run.error.message)}</pre></section>`
    : '';

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Report ${escapeHtml(run.testId)}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; background:#0b0b0c; color:#f4f4f5; margin:0; }
    header { padding: 20px; border-bottom: 1px solid #27272a; background: #111113; position: sticky; top: 0; }
    .meta { display:flex; flex-wrap:wrap; gap:12px; font-size: 13px; color:#a1a1aa; }
    .pill { border:1px solid #27272a; padding:6px 10px; border-radius:999px; }
    main { padding: 20px; max-width: 1100px; margin: 0 auto; }
    .step { padding: 14px; border: 1px solid #27272a; border-radius: 12px; background:#0f0f10; margin-bottom: 14px; }
    .step-head { display:flex; justify-content:space-between; gap:12px; align-items:baseline; }
    .step-title { font-weight: 700; }
    .step-time { color:#a1a1aa; font-size: 12px; }
    .shots { display:grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; margin-top: 12px; }
    .shot { display:block; text-decoration:none; color:inherit; border:1px solid #27272a; border-radius: 12px; overflow:hidden; background:#09090b; }
    .shot img { width:100%; height: 160px; object-fit: cover; display:block; }
    .caption { padding: 10px; font-size: 12px; color:#d4d4d8; border-top:1px solid #27272a; }
    pre { white-space: pre-wrap; word-break: break-word; }
    .details { margin-top: 10px; font-size: 12px; color:#d4d4d8; background:#09090b; border:1px solid #27272a; border-radius: 10px; padding: 10px; }
    .error { border:1px solid #7f1d1d; background:#130b0b; padding: 14px; border-radius: 12px; }
    .status-pass { color:#22c55e; font-weight:700; }
    .status-fail { color:#ef4444; font-weight:700; }
    .status-running { color:#eab308; font-weight:700; }
  </style>
</head>
<body>
  <header>
    <h1 style="margin:0 0 10px 0">Report: ${escapeHtml(run.testId)}</h1>
    <div class="meta">
      <div class="pill">Status: <span class="${run.status === 'PASS' ? 'status-pass' : run.status === 'FAIL' ? 'status-fail' : 'status-running'}">${escapeHtml(run.status)}</span></div>
      <div class="pill">Start: ${escapeHtml(run.startedAt)}</div>
      <div class="pill">End: ${escapeHtml(run.finishedAt || '')}</div>
      <div class="pill">Duration: ${escapeHtml(String(run.durationMs ?? ''))}ms</div>
    </div>
  </header>
  <main>
    ${errorBlock}
    ${stepsHtml}
  </main>
</body>
</html>`;
}

module.exports = {
  createTestRun,
  logStep,
  finishRun,
  saveTestReport,
  ensureDirSync,
};
