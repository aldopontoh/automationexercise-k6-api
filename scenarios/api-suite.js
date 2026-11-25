import { sleep } from 'k6';
import { getSuiteOptions } from '../lib/config.js';
import { runCatalogSearchScenario } from './catalog-search.js';
import { runAccountLifecycleScenario } from './account-lifecycle.js';

export const options = getSuiteOptions();

/**
 * Main entry point orchestrating all 14 AutomationExercise REST API checks
 * under shared SLA thresholds, polite VU stagger, and safe pacing.
 */
export default function () {
  // Stagger initial VU startup so concurrent VUs do not burst the shared public demo queue in lockstep.
  if (__ITER === 0 && __VU > 1) {
    sleep((__VU - 1) * 1.5);
  }

  runCatalogSearchScenario();
  runAccountLifecycleScenario();
}
