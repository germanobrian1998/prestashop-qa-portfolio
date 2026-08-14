import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const BASE_URL = process.env.BASE_URL ?? 'http://localhost';
const ADMIN_FOLDER = process.env.PS_FOLDER_ADMIN ?? 'admin-qa';

// Sección 6 — BDD (Autenticación). bddgen genera los .spec.ts reales a
// partir del .feature + .steps.ts en una carpeta intermedia; el proyecto
// 'frontoffice-auth' tiene que leer testDir de ACÁ, no de src/tests/auth
// directamente, o bddgen no va a encontrar nada que correr.
const bddAuthTestDir = defineBddConfig({
  features: 'src/tests/auth/*.feature',
  // playwright-bdd 9.2.0 infiere el `test` custom solo con fixtures/bdd.ts
  // incluido acá — importTestFrom ya no hace falta en esta versión (daba warning).
  steps: ['src/tests/auth/*.steps.ts', 'src/fixtures/bdd.ts'],
  // outputDir distinto por cada defineBddConfig — necesario a partir de que
  // hay más de una llamada en el mismo playwright.config.ts, si no colisionan.
  outputDir: '.features-gen/auth',
});

// Sección 6 — BDD (Webservice API Security). Proyecto separado del 'api'
// existente (que usa baseURL `${BASE_URL}/api` para tests no-BDD) para no
// arriesgar esa suite. Reusa src/fixtures/bdd.ts — no hace falta agregar
// fixtures nuevas ahí porque estos steps usan el fixture `request` nativo
// de Playwright, no page objects.
const bddApiSecurityTestDir = defineBddConfig({
  features: 'src/tests/webservice-security/*.feature',
  steps: ['src/tests/webservice-security/*.steps.ts', 'src/fixtures/bdd.ts'],
  outputDir: '.features-gen/webservice-security',
});

// Sección 6 — BDD (Checkout completo). Reusa fixtures/bdd.ts, que ya
// incluye checkoutFacade y compañía. Sin storageState — a diferencia del
// proyecto 'frontoffice' (que asume sesión ya guardada), acá se loguea
// explícito por step cuando el escenario lo necesita, y el escenario de
// guest checkout necesita justamente arrancar SIN sesión.
const bddCheckoutTestDir = defineBddConfig({
  features: 'src/tests/checkout/*.feature',
  steps: ['src/tests/checkout/*.steps.ts', 'src/fixtures/bdd.ts'],
  outputDir: '.features-gen/checkout',
});

const CUSTOMER_AUTH_FILE = path.join(__dirname, 'playwright/.auth/customer.json');
const ADMIN_AUTH_FILE = path.join(__dirname, 'playwright/.auth/admin.json');

/**
 * Playwright config para PrestaShop QA.
 * 6 proyectos: frontoffice (sesión cliente), frontoffice-auth (sin sesión,
 * para los tests de login/registro que necesitan arrancar deslogueados),
 * backoffice (sesión admin), api (sin storageState, usa WebserviceClient
 * con Basic Auth), erp (habla HTTP directo con el mock, sin browser),
 * db (Sección 7 — habla directo con MySQL vía DbClient, sin browser),
 * mobile (viewport emulado, con sesión cliente).
 *
 * globalSetup hace login por UI una única vez en cada superficie y persiste
 * el storageState — evita repetir el login en cada test. Los tests de
 * auth/ quedan fuera de ese storageState a propósito: necesitan la página
 * de login real, no la de un cliente ya autenticado.
 */
export default defineConfig({
  testDir: './src/tests',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['allure-playwright'], ['github']]
    : [['html', { open: 'never' }], ['list']],

  globalSetup: require.resolve('./global-setup'),
  globalTeardown: require.resolve('./global-teardown'),

  use: {
    baseURL: BASE_URL,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'frontoffice',
      testDir: './src/tests',
      testIgnore: ['**/admin/**', '**/api/**', '**/auth/**', '**/erp/**', '**/db/**'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: CUSTOMER_AUTH_FILE,
      },
    },
    {
      name: 'frontoffice-auth',
      testDir: bddAuthTestDir,
      use: {
        ...devices['Desktop Chrome'],
        // Sin storageState: estos tests necesitan arrancar sin sesión
        // (login, registro) — heredar CUSTOMER_AUTH_FILE los rompe, ya
        // que la página de login redirige directo a "Su cuenta".
      },
    },
    {
      name: 'webservice-security-bdd',
      testDir: bddApiSecurityTestDir,
      // Sin storageState ni devices de browser: estos steps usan el
      // fixture `request` nativo de Playwright (HTTP directo), no page.
      use: {},
    },
    {
      name: 'checkout-bdd',
      testDir: bddCheckoutTestDir,
      use: {
        ...devices['Desktop Chrome'],
        // Sin storageState: mismo motivo que frontoffice-auth — el
        // escenario de guest checkout necesita arrancar sin sesión, y los
        // que sí necesitan cliente logueado lo hacen explícito por step.
      },
    },
    {
      name: 'backoffice',
      testDir: './src/tests/admin',
      use: {
        ...devices['Desktop Chrome'],
        // Barra final obligatoria — sin ella, un path que arranca con '/'
        // (BasePage.navigate) se resuelve como absoluto respecto al origen
        // y descarta el subpath '/admin-qa' (mismo patrón de bug que
        // WebserviceClient). Ver también el fix en BasePage.navigate().
        baseURL: `${BASE_URL}/${ADMIN_FOLDER}/`,
        storageState: ADMIN_AUTH_FILE,
      },
    },
    {
      name: 'api',
      testDir: './src/tests/api',
      use: {
        // Sin storageState de navegador: la autenticación la maneja
        // WebserviceClient vía Basic Auth con la API key.
        baseURL: `${BASE_URL}/api`,
      },
    },
    {
      name: 'erp',
      testDir: './src/tests/erp',
      // Sin storageState ni baseURL de navegador: erp-sync.spec.ts habla
      // HTTP directo con ErpMockClient (fetch), no usa page/browser.
      // Proyecto dedicado para no duplicarse en frontoffice + mobile --
      // el mock de ERP tiene estado GLOBAL por recurso
      // (stale/timeout/inconsistent), asi que corrida duplicada en
      // paralelo pisa un test contra otro.
      use: {},
    },
    {
      name: 'db',
      testDir: './src/tests/db',
      // Sección 7 — Sin storageState ni baseURL de navegador: los specs
      // de esta sección hablan directo con MySQL vía DbClient (fixture
      // `dbClient`), no usan `page` ni `request` del navegador.
      use: {},
    },
    {
      name: 'mobile',
      testDir: './src/tests',
      // Mismo motivo que en 'frontoffice': auth/ no puede heredar sesión.
      testIgnore: ['**/admin/**', '**/api/**', '**/auth/**', '**/erp/**', '**/db/**'],
      use: {
        ...devices['Pixel 7'],
        storageState: CUSTOMER_AUTH_FILE,
      },
    },
  ],
});
