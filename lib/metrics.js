import { Counter, Trend } from 'k6/metrics';

/**
 * Custom performance metrics enabling per-tier SLA tracking and rich visual
 * charts in reports/summary.html.
 */
export const readTierDuration = new Trend('endpoint_read_duration', true);
export const searchAuthTierDuration = new Trend('endpoint_search_auth_duration', true);
export const writeTierDuration = new Trend('endpoint_write_duration', true);
export const productsPayloadBytes = new Trend('products_payload_bytes', false);
export const trafficMixHits = new Counter('traffic_mix_hits');
