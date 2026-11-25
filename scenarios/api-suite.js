import { getSuiteOptions } from '../lib/config.js';
import { runCatalogSearchScenario } from './catalog-search.js';
import { runAccountLifecycleScenario } from './account-lifecycle.js';

export const options = getSuiteOptions();

/**
 * Main entry point orchestrating all 14 AutomationExercise REST API checks
 * under shared SLA thresholds and safe VU pacing.
 */
export default function () {
  runCatalogSearchScenario();
  runAccountLifecycleScenario();
}
