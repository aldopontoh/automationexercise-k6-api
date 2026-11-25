import { group } from 'k6';
import { SharedArray } from 'k6/data';
import {
  BASE_URL,
  DEFAULT_HEADERS,
  FORM_HEADERS,
  TEST_PROFILE,
  buildFormBody,
  requestWithRetry,
  thinkTime,
} from '../lib/config.js';
import { assertApiResponse } from '../lib/assertions.js';
import {
  productsPayloadBytes,
  readTierDuration,
  searchAuthTierDuration,
  trafficMixHits,
} from '../lib/metrics.js';

const searchTerms = new SharedArray('search_terms', () => {
  const raw = open('../data/search_terms.csv');
  return raw
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
});

/**
 * Executes AutomationExercise Catalog & Search APIs (APIs 1–6).
 * Traceability: API-REQ-CAT-01..06 -> API-TC-CAT-01..06.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.fullCsvSweep] - When true (smoke default), runs all 5 CSV search terms; otherwise rotates 1 term.
 */
export function runCatalogSearchScenario(opts = {}) {
  const fullCsvSweep = opts.fullCsvSweep !== undefined ? opts.fullCsvSweep : TEST_PROFILE === 'smoke';
  trafficMixHits.add(1, { bucket: 'browse_search' });

  group('Catalog & Search API (APIs 1-6)', () => {
    // API 1: GET /api/productsList (API-REQ-CAT-01 / API-TC-CAT-01)
    const productsRes = requestWithRetry('GET', `${BASE_URL}/api/productsList`, null, {
      headers: DEFAULT_HEADERS,
      tags: { api: 'API-1-productsList-GET', module: 'catalog-search', tier: 'read' },
    });
    readTierDuration.add(productsRes.timings.duration);
    if (typeof productsRes.body === 'string') {
      productsPayloadBytes.add(productsRes.body.length);
    }

    assertApiResponse(productsRes, {
      label: 'API 1 - GET /api/productsList',
      expectedHttpStatus: 200,
      expectedResponseCode: 200,
      extraChecks: {
        'products is a non-empty array': (body) => Array.isArray(body.products) && body.products.length > 0,
        'first product has id, name, price, brand, category': (body) => {
          const item = body.products && body.products[0];
          return Boolean(item && item.id && item.name && item.price && item.brand && item.category);
        },
        'catalog payload size is within expected bounds (< 256 KB)': (_body, res) =>
          typeof res.body === 'string' && res.body.length > 100 && res.body.length < 262144,
      },
      abortOnFail: true,
    });
    thinkTime();

    // API 2: POST /api/productsList -> 405 (API-REQ-CAT-02 / API-TC-CAT-02)
    const productsPostRes = requestWithRetry('POST', `${BASE_URL}/api/productsList`, null, {
      headers: FORM_HEADERS,
      tags: { api: 'API-2-productsList-POST', module: 'catalog-search', tier: 'negative' },
    });
    assertApiResponse(productsPostRes, {
      label: 'API 2 - POST /api/productsList (405)',
      expectedHttpStatus: 200,
      expectedResponseCode: 405,
      expectedMessage: 'This request method is not supported.',
      abortOnFail: true,
    });
    thinkTime();

    // API 3: GET /api/brandsList (API-REQ-CAT-03 / API-TC-CAT-03)
    const brandsRes = requestWithRetry('GET', `${BASE_URL}/api/brandsList`, null, {
      headers: DEFAULT_HEADERS,
      tags: { api: 'API-3-brandsList-GET', module: 'catalog-search', tier: 'read' },
    });
    readTierDuration.add(brandsRes.timings.duration);

    assertApiResponse(brandsRes, {
      label: 'API 3 - GET /api/brandsList',
      expectedHttpStatus: 200,
      expectedResponseCode: 200,
      extraChecks: {
        'brands is a non-empty array': (body) => Array.isArray(body.brands) && body.brands.length > 0,
        'first brand has id and brand name': (body) => {
          const item = body.brands && body.brands[0];
          return Boolean(item && item.id && item.brand);
        },
      },
      abortOnFail: true,
    });
    thinkTime();

    // API 4: PUT /api/brandsList -> 405 (API-REQ-CAT-04 / API-TC-CAT-04)
    const brandsPutRes = requestWithRetry('PUT', `${BASE_URL}/api/brandsList`, null, {
      headers: FORM_HEADERS,
      tags: { api: 'API-4-brandsList-PUT', module: 'catalog-search', tier: 'negative' },
    });
    assertApiResponse(brandsPutRes, {
      label: 'API 4 - PUT /api/brandsList (405)',
      expectedHttpStatus: 200,
      expectedResponseCode: 405,
      expectedMessage: 'This request method is not supported.',
      abortOnFail: true,
    });
    thinkTime();

    // API 5: POST /api/searchProduct with CSV data (API-REQ-CAT-05 / API-TC-CAT-05)
    const termsToRun = fullCsvSweep
      ? searchTerms
      : [searchTerms[(__VU + __ITER) % searchTerms.length]];

    for (const term of termsToRun) {
      const searchRes = requestWithRetry(
        'POST',
        `${BASE_URL}/api/searchProduct`,
        buildFormBody({ search_product: term }),
        {
          headers: FORM_HEADERS,
          tags: {
            api: 'API-5-searchProduct-POST',
            module: 'catalog-search',
            tier: 'search_auth',
            search_term: term,
          },
        }
      );
      searchAuthTierDuration.add(searchRes.timings.duration);

      assertApiResponse(searchRes, {
        label: 'API 5 - POST /api/searchProduct (CSV valid)',
        expectedHttpStatus: 200,
        expectedResponseCode: 200,
        extraChecks: {
          'searched products array is non-empty': (body) =>
            Array.isArray(body.products) && body.products.length > 0,
          'first searched product has id, name, price': (body) => {
            const item = body.products && body.products[0];
            return Boolean(item && item.id && item.name && item.price);
          },
        },
        abortOnFail: true,
      });
      thinkTime();
    }

    // API 6: POST /api/searchProduct without search_product -> 400 (API-REQ-CAT-06 / API-TC-CAT-06)
    const missingParamRes = requestWithRetry('POST', `${BASE_URL}/api/searchProduct`, null, {
      headers: FORM_HEADERS,
      tags: { api: 'API-6-searchProduct-missing-param', module: 'catalog-search', tier: 'search_auth' },
    });
    searchAuthTierDuration.add(missingParamRes.timings.duration);

    assertApiResponse(missingParamRes, {
      label: 'API 6 - POST /api/searchProduct (missing param 400)',
      expectedHttpStatus: 200,
      expectedResponseCode: 400,
      expectedMessage: 'Bad request, search_product parameter is missing in POST request.',
      abortOnFail: true,
    });
    thinkTime();
  });
}
