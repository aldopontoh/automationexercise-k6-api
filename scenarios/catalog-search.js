import http from 'k6/http';
import { group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import {
  BASE_URL,
  DEFAULT_HEADERS,
  FORM_HEADERS,
  PACING_SECONDS,
  TEST_PROFILE,
  buildFormBody,
} from '../lib/config.js';
import { assertApiResponse } from '../lib/assertions.js';

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
 */
export function runCatalogSearchScenario() {
  group('Catalog & Search API (APIs 1-6)', () => {
    // API 1: GET /api/productsList (API-REQ-CAT-01 / API-TC-CAT-01)
    const productsRes = http.get(`${BASE_URL}/api/productsList`, {
      headers: DEFAULT_HEADERS,
      tags: { api: 'API-1-productsList-GET', module: 'catalog-search' },
    });
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
      },
      abortOnFail: true,
    });
    sleep(PACING_SECONDS);

    // API 2: POST /api/productsList -> 405 (API-REQ-CAT-02 / API-TC-CAT-02)
    const productsPostRes = http.post(`${BASE_URL}/api/productsList`, null, {
      headers: FORM_HEADERS,
      tags: { api: 'API-2-productsList-POST', module: 'catalog-search' },
    });
    assertApiResponse(productsPostRes, {
      label: 'API 2 - POST /api/productsList (405)',
      expectedHttpStatus: 200,
      expectedResponseCode: 405,
      expectedMessage: 'This request method is not supported.',
      abortOnFail: true,
    });
    sleep(PACING_SECONDS);

    // API 3: GET /api/brandsList (API-REQ-CAT-03 / API-TC-CAT-03)
    const brandsRes = http.get(`${BASE_URL}/api/brandsList`, {
      headers: DEFAULT_HEADERS,
      tags: { api: 'API-3-brandsList-GET', module: 'catalog-search' },
    });
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
    sleep(PACING_SECONDS);

    // API 4: PUT /api/brandsList -> 405 (API-REQ-CAT-04 / API-TC-CAT-04)
    const brandsPutRes = http.put(`${BASE_URL}/api/brandsList`, null, {
      headers: FORM_HEADERS,
      tags: { api: 'API-4-brandsList-PUT', module: 'catalog-search' },
    });
    assertApiResponse(brandsPutRes, {
      label: 'API 4 - PUT /api/brandsList (405)',
      expectedHttpStatus: 200,
      expectedResponseCode: 405,
      expectedMessage: 'This request method is not supported.',
      abortOnFail: true,
    });
    sleep(PACING_SECONDS);

    // API 5: POST /api/searchProduct with CSV data (API-REQ-CAT-05 / API-TC-CAT-05)
    // In smoke mode, exercise every CSV term to guarantee 100% data coverage;
    // in load mode, rotate one CSV term per VU/iteration to keep request cadence balanced.
    const termsToRun =
      TEST_PROFILE === 'load'
        ? [searchTerms[(__VU + __ITER) % searchTerms.length]]
        : searchTerms;

    for (const term of termsToRun) {
      const searchRes = http.post(
        `${BASE_URL}/api/searchProduct`,
        buildFormBody({ search_product: term }),
        {
          headers: FORM_HEADERS,
          tags: { api: 'API-5-searchProduct-POST', module: 'catalog-search', search_term: term },
        }
      );
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
      sleep(PACING_SECONDS);
    }

    // API 6: POST /api/searchProduct without search_product -> 400 (API-REQ-CAT-06 / API-TC-CAT-06)
    const missingParamRes = http.post(`${BASE_URL}/api/searchProduct`, null, {
      headers: FORM_HEADERS,
      tags: { api: 'API-6-searchProduct-missing-param', module: 'catalog-search' },
    });
    assertApiResponse(missingParamRes, {
      label: 'API 6 - POST /api/searchProduct (missing param 400)',
      expectedHttpStatus: 200,
      expectedResponseCode: 400,
      expectedMessage: 'Bad request, search_product parameter is missing in POST request.',
      abortOnFail: true,
    });
    sleep(PACING_SECONDS);
  });
}
