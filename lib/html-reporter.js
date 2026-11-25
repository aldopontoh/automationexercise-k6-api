import { PROFILE_METADATA, TEST_PROFILE } from './config.js';

/**
 * Zero-dependency, Jenkins-CSP-compatible Grafana-k6-inspired visual SVG+HTML reporter.
 * Uses external `report.css` + pure inline SVG presentation attributes (zero `<script>`
 * and zero inline `style=""`) so every chart renders sharply both locally and inside
 * Jenkins's default strict Content-Security-Policy sandbox.
 */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtNum(val, decimals = 2) {
  if (val === undefined || val === null || Number.isNaN(Number(val))) return 'N/A';
  return Number(val).toFixed(decimals);
}

function fmtDuration(ms) {
  if (ms === undefined || ms === null || Number.isNaN(Number(ms))) return 'N/A';
  const n = Number(ms);
  return n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${n.toFixed(1)} ms`;
}

function fmtBytes(bytes) {
  if (bytes === undefined || bytes === null || Number.isNaN(Number(bytes))) return '0 B';
  const n = Number(bytes);
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${Math.round(n)} B`;
}

function fmtRateBytes(bytesPerSec) {
  return `${fmtBytes(bytesPerSec)}/s`;
}

function collectGroups(group, results = []) {
  if (!group) return results;
  if (group.checks && group.checks.length > 0) {
    results.push({
      name: group.name || 'Root Checks',
      checks: group.checks,
    });
  }
  if (Array.isArray(group.groups)) {
    for (const sub of group.groups) {
      collectGroups(sub, results);
    }
  }
  return results;
}

function collectThresholds(metrics) {
  const rows = [];
  for (const [metricName, metricObj] of Object.entries(metrics || {})) {
    if (!metricObj || !metricObj.thresholds) continue;
    for (const [expr, result] of Object.entries(metricObj.thresholds)) {
      rows.push({
        metric: metricName,
        expression: expr,
        ok: Boolean(result && result.ok),
      });
    }
  }
  return rows;
}

function buildSparklineSvg(color, points) {
  const areaPoints = `0,36 ${points} 160,36`;
  return `<svg class="sparkline" viewBox="0 0 160 36" preserveAspectRatio="none" aria-hidden="true">
    <polygon points="${areaPoints}" fill="${color}" fill-opacity="0.16" />
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;
}

function buildLatencyAreaChartSvg(durMetric, slaLimitMs) {
  const pointsSpec = [
    { label: 'Min', val: Number(durMetric.min || 0) },
    { label: 'Med', val: Number(durMetric.med || 0) },
    { label: 'Avg', val: Number(durMetric.avg || 0) },
    { label: 'p(90)', val: Number(durMetric['p(90)'] || 0) },
    { label: 'p(95)', val: Number(durMetric['p(95)'] || 0) },
    { label: 'p(99)', val: Number(durMetric['p(99)'] || durMetric.max || 0) },
    { label: 'Max', val: Number(durMetric.max || 0) },
  ];

  const width = 960;
  const height = 250;
  const padLeft = 64;
  const padRight = 32;
  const padTop = 26;
  const padBottom = 42;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxDataVal = Math.max(...pointsSpec.map((p) => p.val), slaLimitMs * 0.6, 500);
  const yMax = Math.ceil((Math.max(maxDataVal, slaLimitMs) * 1.1) / 500) * 500;

  const yPos = (val) => padTop + plotH - (Math.min(val, yMax) / yMax) * plotH;
  const xPos = (idx) => padLeft + (idx / (pointsSpec.length - 1)) * plotW;

  const gridLines = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const val = yMax * ratio;
      const y = yPos(val).toFixed(1);
      return `
        <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="#2a2d42" stroke-width="1" />
        <text x="${padLeft - 10}" y="${Number(y) + 4}" fill="#8b90ad" font-size="11" text-anchor="end">${fmtDuration(val)}</text>`;
    })
    .join('');

  const coords = pointsSpec.map((p, idx) => ({
    ...p,
    x: xPos(idx),
    y: yPos(p.val),
  }));

  const polyLine = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPoly = `${padLeft},${(padTop + plotH).toFixed(1)} ${polyLine} ${(width - padRight).toFixed(1)},${(padTop + plotH).toFixed(1)}`;
  const slaY = yPos(slaLimitMs).toFixed(1);

  const dotsAndLabels = coords
    .map(
      (c) => `
      <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="4.5" fill="#13141f" stroke="#38bdf8" stroke-width="2.5" />
      <text x="${c.x.toFixed(1)}" y="${(c.y - 10).toFixed(1)}" fill="#e2e8f0" font-size="11" font-weight="600" text-anchor="middle">${fmtDuration(c.val)}</text>
      <text x="${c.x.toFixed(1)}" y="${(height - 14).toFixed(1)}" fill="#94a3b8" font-size="12" text-anchor="middle">${c.label}</text>`
    )
    .join('');

  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="HTTP Latency Distribution Curve">
    <defs>
      <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.40" />
        <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.02" />
      </linearGradient>
    </defs>
    ${gridLines}
    <line x1="${padLeft}" y1="${slaY}" x2="${width - padRight}" y2="${slaY}" stroke="#a855f7" stroke-width="1.5" stroke-dasharray="6,4" />
    <text x="${width - padRight}" y="${Number(slaY) - 6}" fill="#c084fc" font-size="11" font-weight="600" text-anchor="end">SLA Limit p(95) &lt; ${fmtDuration(slaLimitMs)}</text>
    <polygon points="${areaPoly}" fill="url(#latencyGrad)" />
    <polyline points="${polyLine}" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    ${dotsAndLabels}
  </svg>`;
}

function buildTierBarsSvg(metrics, isDestructiveProfile) {
  const readVal = metrics.endpoint_read_duration?.values?.['p(95)'] ?? 0;
  const searchVal = metrics.endpoint_search_auth_duration?.values?.['p(95)'] ?? 0;
  const writeVal = metrics.endpoint_write_duration?.values?.['p(95)'] ?? 0;

  const tiers = [
    {
      name: 'Read-Only (APIs 1, 3)',
      val: Number(readVal),
      sla: isDestructiveProfile ? 3500 : 2000,
      color: '#2dd4bf',
    },
    {
      name: 'Search & Auth (APIs 5-10, 14)',
      val: Number(searchVal),
      sla: isDestructiveProfile ? 4000 : 2500,
      color: '#38bdf8',
    },
    {
      name: 'Write CRUD (APIs 11-13)',
      val: Number(writeVal),
      sla: isDestructiveProfile ? 5000 : 3500,
      color: '#a855f7',
    },
  ];

  const width = 480;
  const height = 210;
  const maxScale = Math.max(...tiers.map((t) => Math.max(t.val, t.sla)), 3500) * 1.1;
  const barX = 16;
  const barMaxW = width - 32;

  const rows = tiers
    .map((t, idx) => {
      const yBase = 24 + idx * 62;
      const barW = Math.max(4, Math.min(barMaxW, (t.val / maxScale) * barMaxW));
      const slaX = barX + (t.sla / maxScale) * barMaxW;
      const ok = t.val <= t.sla;
      const fill = ok ? t.color : '#ef4444';

      return `
        <text x="${barX}" y="${yBase}" fill="#cbd5e1" font-size="12" font-weight="600">${escapeHtml(t.name)}</text>
        <text x="${width - 16}" y="${yBase}" fill="${ok ? '#4ade80' : '#f87171'}" font-size="12" font-weight="700" text-anchor="end">p(95) ${fmtDuration(t.val)} / ${fmtDuration(t.sla)}</text>
        <rect x="${barX}" y="${yBase + 8}" width="${barMaxW}" height="18" rx="6" fill="#25283d" />
        <rect x="${barX}" y="${yBase + 8}" width="${barW.toFixed(1)}" height="18" rx="6" fill="${fill}" />
        <line x1="${slaX.toFixed(1)}" y1="${yBase + 4}" x2="${slaX.toFixed(1)}" y2="${yBase + 30}" stroke="#f8fafc" stroke-width="1.5" stroke-dasharray="3,2" />`;
    })
    .join('');

  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Per-Tier p95 Latency vs SLA">
    ${rows}
  </svg>`;
}

function buildCheckDonutSvg(passPct, passes, fails) {
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const passArc = (Math.max(0, Math.min(100, passPct)) / 100) * circumference;
  const failArc = circumference - passArc;
  const strokeColor = fails === 0 ? '#2dd4bf' : '#f59e0b';

  return `<svg class="donut-svg" viewBox="0 0 160 160" role="img" aria-label="Checks Pass Rate Donut">
    <circle cx="80" cy="80" r="${radius}" fill="none" stroke="#25283d" stroke-width="16" />
    <circle cx="80" cy="80" r="${radius}" fill="none" stroke="${strokeColor}" stroke-width="16"
      stroke-dasharray="${passArc.toFixed(1)} ${failArc.toFixed(1)}"
      transform="rotate(-90 80 80)" stroke-linecap="round" />
    <text x="80" y="76" fill="#f8fafc" font-size="22" font-weight="700" text-anchor="middle">${fmtNum(passPct, 1)}%</text>
    <text x="80" y="96" fill="#94a3b8" font-size="11" text-anchor="middle">${passes} pass / ${fails} fail</text>
  </svg>`;
}

export const REPORT_CSS = `
:root {
  --bg: #13141f;
  --topbar: #191a27;
  --surface: #1b1d2b;
  --surface-alt: #222538;
  --border: #2c2f45;
  --text: #f1f5f9;
  --muted: #8b90ad;
  --purple: #7c3aed;
  --purple-soft: rgba(124, 58, 237, 0.22);
  --teal: #2dd4bf;
  --blue: #38bdf8;
  --pass: #22c55e;
  --pass-bg: rgba(34, 197, 94, 0.14);
  --fail: #ef4444;
  --fail-bg: rgba(239, 68, 68, 0.16);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 0 0 48px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.45;
}

.topbar {
  background: var(--topbar);
  border-bottom: 1px solid var(--border);
  padding: 14px 28px;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.k6-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: var(--purple);
  color: #ffffff;
  font-weight: 800;
  font-size: 14px;
  letter-spacing: -0.02em;
}

.brand-title {
  font-size: 17px;
  font-weight: 700;
  margin: 0;
}

.brand-sub {
  font-size: 12px;
  color: var(--muted);
  margin: 2px 0 0;
}

.topbar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.profile-pill {
  padding: 6px 12px;
  border-radius: 8px;
  background: var(--purple-soft);
  border: 1px solid var(--purple);
  color: #ddd6fe;
  font-size: 12px;
  font-weight: 600;
}

.btn-link {
  display: inline-block;
  padding: 7px 14px;
  border-radius: 8px;
  background: var(--purple);
  color: #ffffff;
  text-decoration: none;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.btn-link:hover {
  opacity: 0.9;
}

.status-banner {
  padding: 6px 14px;
  border-radius: 8px;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.status-pass {
  background: var(--pass-bg);
  color: var(--pass);
  border: 1px solid var(--pass);
}

.status-fail {
  background: var(--fail-bg);
  color: var(--fail);
  border: 1px solid var(--fail);
}

.container {
  max-width: 1240px;
  margin: 22px auto 0;
  padding: 0 20px;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(185px, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.kpi-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.kpi-label {
  font-size: 12px;
  color: var(--muted);
  text-align: center;
  margin-bottom: 6px;
}

.kpi-value {
  font-size: 24px;
  font-weight: 700;
  text-align: center;
  color: var(--text);
}

.kpi-sub {
  font-size: 11px;
  color: var(--muted);
  text-align: center;
  margin: 4px 0 8px;
}

.kpi-good .kpi-value { color: var(--teal); }
.kpi-bad .kpi-value { color: var(--fail); }

.sparkline {
  width: 100%;
  height: 34px;
  display: block;
}

.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 18px 20px;
  margin-bottom: 18px;
}

.panel h2 {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 600;
  color: #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel h3 {
  margin: 18px 0 10px;
  font-size: 14px;
  color: var(--blue);
}

.panel-sub {
  font-size: 12px;
  color: var(--muted);
  font-weight: 400;
}

.chart-svg {
  width: 100%;
  height: auto;
  display: block;
}

.two-col {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 18px;
  margin-bottom: 18px;
}

.two-col .panel {
  margin-bottom: 0;
}

.donut-wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-around;
  gap: 16px;
}

.donut-svg {
  width: 156px;
  height: 156px;
  flex-shrink: 0;
}

.stat-list {
  list-style: none;
  margin: 0;
  padding: 0;
  min-width: 210px;
  flex: 1;
}

.stat-list li {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}

.stat-list li:last-child { border-bottom: none; }

.stat-key { color: var(--muted); }
.stat-val { font-weight: 700; color: var(--text); }

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

th, td {
  text-align: left;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border);
}

th {
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--surface-alt);
}

tr:last-child td { border-bottom: none; }

code {
  font-family: Consolas, Monaco, "Courier New", monospace;
  font-size: 12px;
  background: var(--surface-alt);
  padding: 2px 6px;
  border-radius: 5px;
  color: var(--teal);
}

.badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.badge-pass {
  background: var(--pass-bg);
  color: var(--pass);
}

.badge-fail {
  background: var(--fail-bg);
  color: var(--fail);
}

.footer {
  text-align: center;
  color: var(--muted);
  font-size: 12px;
  margin-top: 24px;
}
`;

export function generateHtmlReport(data) {
  const metrics = data.metrics || {};
  const checksMetric = metrics.checks?.values || {};
  const reqsMetric = metrics.http_reqs?.values || {};
  const failedMetric = metrics.http_req_failed?.values || {};
  const durMetric = metrics.http_req_duration?.values || {};
  const iterMetric = metrics.iterations?.values || {};
  const vusMaxMetric = metrics.vus_max?.values || {};
  const contractMetric = metrics.api_contract_failures?.values || { count: 0 };
  const payloadMetric = metrics.products_payload_bytes?.values || {};
  const dataRecv = metrics.data_received?.values || { count: 0, rate: 0 };
  const dataSent = metrics.data_sent?.values || { count: 0, rate: 0 };

  const profileInfo = PROFILE_METADATA[TEST_PROFILE] || PROFILE_METADATA.smoke;
  const isDestructiveProfile = TEST_PROFILE === 'stress' || TEST_PROFILE === 'spike';
  const globalSlaMs = isDestructiveProfile ? 5000 : 3500;

  const thresholds = collectThresholds(metrics);
  const allThresholdsPassed = thresholds.every((t) => t.ok);
  const checksPassed = checksMetric.passes || 0;
  const checksFailed = checksMetric.fails || 0;
  const checksTotal = checksPassed + checksFailed;
  const checksRatePct = checksTotal > 0 ? (checksPassed / checksTotal) * 100 : 100;
  const httpFailPct = (failedMetric.rate || 0) * 100;
  const httpFailCount = failedMetric.passes || 0;
  const contractFailures = contractMetric.count || 0;
  const overallPass = allThresholdsPassed && checksFailed === 0 && contractFailures === 0;

  const groups = collectGroups(data.root_group);
  const generatedAt = new Date().toISOString();

  const thresholdRowsHtml = thresholds
    .map(
      (t) => `
      <tr>
        <td><code>${escapeHtml(t.metric)}</code></td>
        <td><code>${escapeHtml(t.expression)}</code></td>
        <td><span class="badge ${t.ok ? 'badge-pass' : 'badge-fail'}">${t.ok ? 'PASS' : 'FAIL'}</span></td>
      </tr>`
    )
    .join('');

  const groupTablesHtml = groups
    .map((grp) => {
      const checkRows = grp.checks
        .map((c) => {
          const ok = c.fails === 0;
          return `
            <tr>
              <td>${escapeHtml(c.name)}</td>
              <td>${c.passes}</td>
              <td>${c.fails}</td>
              <td><span class="badge ${ok ? 'badge-pass' : 'badge-fail'}">${ok ? 'PASS' : 'FAIL'}</span></td>
            </tr>`;
        })
        .join('');

      return `
        <h3>${escapeHtml(grp.name)}</h3>
        <table>
          <thead>
            <tr>
              <th>Check Assertion</th>
              <th>Passes</th>
              <th>Fails</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${checkRows}
          </tbody>
        </table>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AutomationExercise k6 Performance Dashboard</title>
  <link rel="stylesheet" href="report.css" />
</head>
<body>
  <div class="topbar">
    <div class="brand">
      <span class="k6-logo">k6</span>
      <div>
        <h1 class="brand-title">AutomationExercise API Performance Overview</h1>
        <p class="brand-sub">${escapeHtml(profileInfo.description)} &middot; ${escapeHtml(generatedAt)}</p>
      </div>
    </div>
    <div class="topbar-actions">
      <span class="profile-pill">${escapeHtml(profileInfo.title)}</span>
      <span class="status-banner ${overallPass ? 'status-pass' : 'status-fail'}">
        ${overallPass ? 'ALL SLA GATES PASSED' : 'SLA / CHECK FAILURE'}
      </span>
      <a class="btn-link" href="dashboard.html">Interactive Time-Series Report</a>
    </div>
  </div>

  <div class="container">
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Iteration Rate</div>
        <div class="kpi-value">${fmtNum(iterMetric.rate || 0, 2)}/s</div>
        <div class="kpi-sub">${iterMetric.count || 0} completed iters</div>
        ${buildSparklineSvg('#2dd4bf', '0,28 32,24 64,22 96,18 128,15 160,12')}
      </div>
      <div class="kpi-card">
        <div class="kpi-label">HTTP Request Rate</div>
        <div class="kpi-value">${fmtNum(reqsMetric.rate || 0, 2)}/s</div>
        <div class="kpi-sub">${reqsMetric.count || 0} total HTTP reqs</div>
        ${buildSparklineSvg('#2dd4bf', '0,26 32,20 64,23 96,16 128,14 160,10')}
      </div>
      <div class="kpi-card">
        <div class="kpi-label">HTTP Request Duration p(95)</div>
        <div class="kpi-value">${fmtDuration(durMetric['p(95)'])}</div>
        <div class="kpi-sub">avg ${fmtDuration(durMetric.avg)} &middot; med ${fmtDuration(durMetric.med)}</div>
        ${buildSparklineSvg('#38bdf8', '0,22 32,16 64,14 96,18 128,24 160,28')}
      </div>
      <div class="kpi-card ${httpFailCount === 0 ? 'kpi-good' : 'kpi-bad'}">
        <div class="kpi-label">HTTP Request Failed</div>
        <div class="kpi-value">${fmtNum(httpFailPct, 2)}%</div>
        <div class="kpi-sub">${httpFailCount} failed / ${reqsMetric.count || 0} total</div>
        ${buildSparklineSvg(httpFailCount === 0 ? '#22c55e' : '#ef4444', '0,34 40,34 80,34 120,34 160,34')}
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Received Rate</div>
        <div class="kpi-value">${fmtRateBytes(dataRecv.rate || 0)}</div>
        <div class="kpi-sub">${fmtBytes(dataRecv.count || 0)} total received</div>
        ${buildSparklineSvg('#2dd4bf', '0,28 32,26 64,24 96,20 128,16 160,11')}
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Sent Rate</div>
        <div class="kpi-value">${fmtRateBytes(dataSent.rate || 0)}</div>
        <div class="kpi-sub">${fmtBytes(dataSent.count || 0)} total sent</div>
        ${buildSparklineSvg('#38bdf8', '0,30 32,28 64,27 96,24 128,22 160,18')}
      </div>
    </div>

    <div class="panel">
      <h2>
        HTTP Performance Overview — Latency Percentile Curve
        <span class="panel-sub">Min &rarr; Med &rarr; Avg &rarr; p(90) &rarr; p(95) &rarr; p(99) &rarr; Max vs SLA Ceiling</span>
      </h2>
      ${buildLatencyAreaChartSvg(durMetric, globalSlaMs)}
    </div>

    <div class="two-col">
      <div class="panel">
        <h2>
          Per-Tier Endpoint SLA Performance
          <span class="panel-sub">Read vs Search/Auth vs Write CRUD</span>
        </h2>
        ${buildTierBarsSvg(metrics, isDestructiveProfile)}
      </div>

      <div class="panel">
        <h2>
          Contract Integrity &amp; Execution Telemetry
          <span class="panel-sub">Checks, Contract Counter &amp; Payload</span>
        </h2>
        <div class="donut-wrap">
          ${buildCheckDonutSvg(checksRatePct, checksPassed, checksFailed)}
          <ul class="stat-list">
            <li><span class="stat-key">Active Profile</span><span class="stat-val">${escapeHtml(TEST_PROFILE)}</span></li>
            <li><span class="stat-key">Peak Virtual Users</span><span class="stat-val">${vusMaxMetric.max || vusMaxMetric.value || 0} VUs</span></li>
            <li><span class="stat-key">API Contract Failures</span><span class="stat-val">${contractFailures}</span></li>
            <li><span class="stat-key">Catalog Avg Payload</span><span class="stat-val">${fmtBytes(payloadMetric.avg || 0)}</span></li>
            <li><span class="stat-key">Threshold Gates Passed</span><span class="stat-val">${thresholds.filter((t) => t.ok).length} / ${thresholds.length}</span></li>
          </ul>
        </div>
      </div>
    </div>

    <div class="panel">
      <h2>SLA Threshold Gates</h2>
      <table>
        <thead>
          <tr>
            <th>Metric / Endpoint Tier</th>
            <th>Configured Threshold</th>
            <th>Gate Status</th>
          </tr>
        </thead>
        <tbody>
          ${thresholdRowsHtml}
        </tbody>
      </table>
    </div>

    <div class="panel">
      <h2>API Endpoint Checks Breakdown (APIs 1–14 + Duplicate-Email Race Check)</h2>
      ${groupTablesHtml}
    </div>

    <div class="footer">
      AutomationExercise k6 API Performance &amp; Functional Suite &middot; CSP-Safe Visual SVG Dashboard &middot; Click "Interactive Time-Series Report" for native k6 Web Dashboard export
    </div>
  </div>
</body>
</html>
`;
}

export function generateTextSummary(data) {
  const metrics = data.metrics || {};
  const checksMetric = metrics.checks?.values || {};
  const durMetric = metrics.http_req_duration?.values || {};
  const failedMetric = metrics.http_req_failed?.values || {};
  const reqsMetric = metrics.http_reqs?.values || {};
  const contractMetric = metrics.api_contract_failures?.values || { count: 0 };
  const readP95 = metrics.endpoint_read_duration?.values?.['p(95)'];
  const searchP95 = metrics.endpoint_search_auth_duration?.values?.['p(95)'];
  const writeP95 = metrics.endpoint_write_duration?.values?.['p(95)'];

  const thresholds = collectThresholds(metrics);
  const groups = collectGroups(data.root_group);
  const passes = checksMetric.passes || 0;
  const fails = checksMetric.fails || 0;
  const total = passes + fails;
  const ratePct = total > 0 ? ((passes / total) * 100).toFixed(2) : '100.00';
  const profileInfo = PROFILE_METADATA[TEST_PROFILE] || PROFILE_METADATA.smoke;

  const lines = [
    '',
    '============================================================',
    `  AUTOMATIONEXERCISE k6 SUITE — ${profileInfo.title.toUpperCase()}`,
    '============================================================',
    '  THRESHOLDS:',
    ...thresholds.map((t) => `    ${t.ok ? '[PASS]' : '[FAIL]'} ${t.metric}: ${t.expression}`),
    '',
    '  KEY METRICS:',
    `    profile...............: ${TEST_PROFILE}`,
    `    checks................: ${ratePct}% (${passes}/${total} passed, ${fails} failed)`,
    `    api_contract_failures.: ${contractMetric.count || 0}`,
    `    http_reqs.............: ${reqsMetric.count || 0} (${fmtNum(reqsMetric.rate || 0, 2)}/s)`,
    `    http_req_failed.......: ${((failedMetric.rate || 0) * 100).toFixed(2)}%`,
    `    http_req_duration.....: avg=${fmtDuration(durMetric.avg)} med=${fmtDuration(durMetric.med)} p(95)=${fmtDuration(durMetric['p(95)'])} max=${fmtDuration(durMetric.max)}`,
    `    tier p(95) latency....: read=${fmtDuration(readP95)} | search_auth=${fmtDuration(searchP95)} | write=${fmtDuration(writeP95)}`,
    '',
    '  ENDPOINT CHECKS:',
  ];

  for (const grp of groups) {
    lines.push(`    -- ${grp.name} --`);
    for (const c of grp.checks) {
      lines.push(`      ${c.fails === 0 ? '[PASS]' : '[FAIL]'} ${c.name} (${c.passes} pass / ${c.fails} fail)`);
    }
  }

  lines.push(
    '',
    '  REPORTS GENERATED:',
    '    - reports/dashboard.html (Interactive k6 Time-Series Web Dashboard when K6_WEB_DASHBOARD=true)',
    '    - reports/summary.html   (CSP-Safe Visual SVG Dashboard)',
    '    - reports/report.css     (Stylesheet)',
    '    - reports/summary.json   (Raw JSON Summary)',
    '============================================================',
    ''
  );

  return lines.join('\n');
}
