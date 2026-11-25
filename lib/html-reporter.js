/**
 * Zero-dependency, Jenkins-CSP-compatible visual HTML + CLI summary reporter for k6.
 * Outputs:
 *   - reports/summary.html (references ./report.css so Jenkins default `style-src 'self'` renders full styling)
 *   - reports/report.css
 *   - reports/summary.json
 *   - stdout (formatted CLI summary)
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

export const REPORT_CSS = `
:root {
  --bg: #0f172a;
  --surface: #1e293b;
  --surface-alt: #162032;
  --border: #334155;
  --text: #f1f5f9;
  --muted: #94a3b8;
  --pass: #22c55e;
  --pass-bg: rgba(34, 197, 94, 0.14);
  --fail: #ef4444;
  --fail-bg: rgba(239, 68, 68, 0.16);
  --accent: #38bdf8;
  --warn: #f59e0b;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 28px 20px 56px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
}

.container {
  max-width: 1180px;
  margin: 0 auto;
}

.header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 24px 28px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  margin-bottom: 24px;
}

.header h1 {
  margin: 0 0 6px;
  font-size: 24px;
  letter-spacing: -0.02em;
}

.subtitle {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
}

.status-banner {
  padding: 10px 20px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.06em;
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

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.kpi-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 18px 20px;
}

.kpi-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin-bottom: 8px;
}

.kpi-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--text);
}

.kpi-sub {
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
}

.kpi-good .kpi-value { color: var(--pass); }
.kpi-bad .kpi-value { color: var(--fail); }
.kpi-accent .kpi-value { color: var(--accent); }

.section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 22px 24px;
  margin-bottom: 24px;
}

.section h2 {
  margin: 0 0 16px;
  font-size: 18px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 10px;
}

.section h3 {
  margin: 20px 0 10px;
  font-size: 15px;
  color: var(--accent);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

th, td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}

th {
  color: var(--muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--surface-alt);
}

tr:last-child td { border-bottom: none; }

code {
  font-family: Consolas, Monaco, "Courier New", monospace;
  font-size: 13px;
  background: var(--surface-alt);
  padding: 2px 6px;
  border-radius: 5px;
  color: var(--accent);
}

.badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
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

.latency-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.latency-box {
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  text-align: center;
}

.latency-box .label {
  font-size: 12px;
  color: var(--muted);
  text-transform: uppercase;
}

.latency-box .val {
  font-size: 20px;
  font-weight: 700;
  margin-top: 6px;
  color: var(--accent);
}

.footer {
  text-align: center;
  color: var(--muted);
  font-size: 12px;
  margin-top: 28px;
}
`;

export function generateHtmlReport(data) {
  const metrics = data.metrics || {};
  const checksMetric = metrics.checks && metrics.checks.values ? metrics.checks.values : {};
  const reqsMetric = metrics.http_reqs && metrics.http_reqs.values ? metrics.http_reqs.values : {};
  const failedMetric = metrics.http_req_failed && metrics.http_req_failed.values ? metrics.http_req_failed.values : {};
  const durMetric = metrics.http_req_duration && metrics.http_req_duration.values ? metrics.http_req_duration.values : {};
  const iterMetric = metrics.iterations && metrics.iterations.values ? metrics.iterations.values : {};
  const vusMaxMetric = metrics.vus_max && metrics.vus_max.values ? metrics.vus_max.values : {};
  const contractMetric =
    metrics.api_contract_failures && metrics.api_contract_failures.values
      ? metrics.api_contract_failures.values
      : { count: 0 };
  const dataRecv = metrics.data_received && metrics.data_received.values ? metrics.data_received.values.count : 0;
  const dataSent = metrics.data_sent && metrics.data_sent.values ? metrics.data_sent.values.count : 0;

  const thresholds = collectThresholds(metrics);
  const allThresholdsPassed = thresholds.every((t) => t.ok);
  const checksPassed = checksMetric.passes || 0;
  const checksFailed = checksMetric.fails || 0;
  const checksTotal = checksPassed + checksFailed;
  const checksRatePct = checksTotal > 0 ? (checksPassed / checksTotal) * 100 : 100;
  const httpFailPct = (failedMetric.rate || 0) * 100;
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
  <title>AutomationExercise k6 API Performance &amp; Functional Report</title>
  <link rel="stylesheet" href="report.css" />
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>AutomationExercise k6 API Verification Report</h1>
        <p class="subtitle">APIs 1–14 Functional Contract &amp; SLA Performance Suite &middot; Generated ${escapeHtml(generatedAt)}</p>
      </div>
      <div class="status-banner ${overallPass ? 'status-pass' : 'status-fail'}">
        ${overallPass ? 'ALL SLA GATES PASSED' : 'SLA / CHECK FAILURE'}
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card ${checksFailed === 0 ? 'kpi-good' : 'kpi-bad'}">
        <div class="kpi-label">Checks Pass Rate</div>
        <div class="kpi-value">${fmtNum(checksRatePct, 2)}%</div>
        <div class="kpi-sub">${checksPassed} passed / ${checksFailed} failed (${checksTotal} total)</div>
      </div>
      <div class="kpi-card ${contractFailures === 0 ? 'kpi-good' : 'kpi-bad'}">
        <div class="kpi-label">API Contract Failures</div>
        <div class="kpi-value">${contractFailures}</div>
        <div class="kpi-sub">Transport + JSON responseCode</div>
      </div>
      <div class="kpi-card ${httpFailPct < 5 ? 'kpi-good' : 'kpi-bad'}">
        <div class="kpi-label">HTTP Error Rate</div>
        <div class="kpi-value">${fmtNum(httpFailPct, 2)}%</div>
        <div class="kpi-sub">${reqsMetric.count || 0} total HTTP requests</div>
      </div>
      <div class="kpi-card kpi-accent">
        <div class="kpi-label">Latency p(95)</div>
        <div class="kpi-value">${fmtDuration(durMetric['p(95)'])}</div>
        <div class="kpi-sub">SLA limit: &lt; 5.00 s</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Execution Scale</div>
        <div class="kpi-value">${vusMaxMetric.max || vusMaxMetric.value || 0} VUs</div>
        <div class="kpi-sub">${iterMetric.count || 0} iterations &middot; ${fmtBytes(dataRecv)} recv / ${fmtBytes(dataSent)} sent</div>
      </div>
    </div>

    <div class="section">
      <h2>SLA Threshold Gates</h2>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Configured Threshold</th>
            <th>Gate Status</th>
          </tr>
        </thead>
        <tbody>
          ${thresholdRowsHtml}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2>HTTP Request Duration Distribution</h2>
      <div class="latency-grid">
        <div class="latency-box"><div class="label">Min</div><div class="val">${fmtDuration(durMetric.min)}</div></div>
        <div class="latency-box"><div class="label">Average</div><div class="val">${fmtDuration(durMetric.avg)}</div></div>
        <div class="latency-box"><div class="label">Median</div><div class="val">${fmtDuration(durMetric.med)}</div></div>
        <div class="latency-box"><div class="label">p(90)</div><div class="val">${fmtDuration(durMetric['p(90)'])}</div></div>
        <div class="latency-box"><div class="label">p(95)</div><div class="val">${fmtDuration(durMetric['p(95)'])}</div></div>
        <div class="latency-box"><div class="label">Max</div><div class="val">${fmtDuration(durMetric.max)}</div></div>
      </div>
    </div>

    <div class="section">
      <h2>API Endpoint Checks Breakdown (APIs 1–14)</h2>
      ${groupTablesHtml}
    </div>

    <div class="footer">
      AutomationExercise k6 API Performance &amp; Functional Verification Suite &middot; Self-contained CSP-safe HTML Report
    </div>
  </div>
</body>
</html>
`;
}

export function generateTextSummary(data) {
  const metrics = data.metrics || {};
  const checksMetric = metrics.checks && metrics.checks.values ? metrics.checks.values : {};
  const durMetric = metrics.http_req_duration && metrics.http_req_duration.values ? metrics.http_req_duration.values : {};
  const failedMetric = metrics.http_req_failed && metrics.http_req_failed.values ? metrics.http_req_failed.values : {};
  const reqsMetric = metrics.http_reqs && metrics.http_reqs.values ? metrics.http_reqs.values : {};
  const contractMetric =
    metrics.api_contract_failures && metrics.api_contract_failures.values
      ? metrics.api_contract_failures.values
      : { count: 0 };

  const thresholds = collectThresholds(metrics);
  const groups = collectGroups(data.root_group);
  const passes = checksMetric.passes || 0;
  const fails = checksMetric.fails || 0;
  const total = passes + fails;
  const ratePct = total > 0 ? ((passes / total) * 100).toFixed(2) : '100.00';

  const lines = [
    '',
    '============================================================',
    '  AUTOMATIONEXERCISE k6 API SUITE — EXECUTION SUMMARY',
    '============================================================',
    '  THRESHOLDS:',
    ...thresholds.map((t) => `    ${t.ok ? '[PASS]' : '[FAIL]'} ${t.metric}: ${t.expression}`),
    '',
    '  KEY METRICS:',
    `    checks................: ${ratePct}% (${passes}/${total} passed, ${fails} failed)`,
    `    api_contract_failures.: ${contractMetric.count || 0}`,
    `    http_reqs.............: ${reqsMetric.count || 0}`,
    `    http_req_failed.......: ${((failedMetric.rate || 0) * 100).toFixed(2)}%`,
    `    http_req_duration.....: avg=${fmtDuration(durMetric.avg)} med=${fmtDuration(durMetric.med)} p(95)=${fmtDuration(durMetric['p(95)'])} max=${fmtDuration(durMetric.max)}`,
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
    '    - reports/summary.html (Visual HTML Dashboard)',
    '    - reports/report.css   (Stylesheet)',
    '    - reports/summary.json (Raw JSON Summary)',
    '============================================================',
    ''
  );

  return lines.join('\n');
}
