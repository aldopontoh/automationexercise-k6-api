import { sleep } from 'k6';
import { TEST_PROFILE, getSuiteOptions } from '../lib/config.js';
import { REPORT_CSS, generateHtmlReport, generateTextSummary } from '../lib/html-reporter.js';
import { runCatalogSearchScenario } from './catalog-search.js';
import { runAccountLifecycleScenario, runAuthValidationBucket } from './account-lifecycle.js';

export const options = getSuiteOptions();

/**
 * Main entry point orchestrating all 14 AutomationExercise REST APIs across
 * 6 selectable professional performance profiles:
 *   - smoke (default CI gate): deterministic 100% API 1–14 + duplicate-email check
 *   - load / stress / spike / soak / throughput:
 *       VU 1 iter 0 guarantees full-tier baseline coverage, followed by a
 *       realistic e-commerce 70/20/10 traffic mix (70% catalog/search,
 *       20% auth validation, 10% full account CRUD lifecycle).
 */
export default function () {
  if (__ITER === 0 && __VU > 1) {
    sleep(Math.min((__VU - 1) * 1.0, 4.0));
  }

  if (TEST_PROFILE === 'smoke') {
    runCatalogSearchScenario({ fullCsvSweep: true });
    runAccountLifecycleScenario();
    return;
  }

  // Ensure every performance tier (read, search_auth, write) always captures baseline samples
  if (__VU === 1 && __ITER === 0) {
    runCatalogSearchScenario({ fullCsvSweep: false });
    runAccountLifecycleScenario();
    return;
  }

  // Realistic 70 / 20 / 10 e-commerce traffic mix weighting
  const roll = Math.random();
  if (roll < 0.7) {
    runCatalogSearchScenario({ fullCsvSweep: false });
  } else if (roll < 0.9) {
    runAuthValidationBucket();
  } else {
    runAccountLifecycleScenario();
  }
}

/**
 * Generates a self-contained, Jenkins-CSP-compatible visual SVG+HTML report,
 * raw JSON summary, and formatted CLI stdout summary on every run.
 * When K6_WEB_DASHBOARD=true and K6_WEB_DASHBOARD_EXPORT=reports/dashboard.html
 * are set, k6 also exports its native interactive time-series Web Dashboard.
 */
export function handleSummary(data) {
  return {
    'reports/summary.html': generateHtmlReport(data),
    'reports/report.css': REPORT_CSS,
    'reports/summary.json': JSON.stringify(data, null, 2),
    stdout: generateTextSummary(data),
  };
}
