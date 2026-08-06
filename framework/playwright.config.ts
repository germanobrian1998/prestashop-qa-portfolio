import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const BASE_URL = process.env.BASE_URL ?? 'http://localhost';
const ADMIN_FOLDER = process.env.PS_FOLDER_ADMIN ?? 'admin-qa';

const CUSTOMER_AUTH_FILE = path.join(__dirname, 'playwright/.auth/customer.json');
const ADMIN_AUTH_FILE = path.join(__dirname, 'playwright/.auth/admin.json');

/**
 * Playwright config para PrestaShop QA.
 * 5 proyectos: frontoffice (sesión cliente), frontoffice-auth (sin sesión,
 * para los tests de login/registro que necesitan arrancar deslogueados),
 * backoffice (sesión admin), api (sin storageState, usa WebserviceClient
 * con Basic Auth), mobile (viewport emulado, con sesión cliente).
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
      testIgnore: ['**/admin/**', '**/api/**', '**/auth/**'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: CUSTOMER_AUTH_FILE,
      },
    },
    {
      name: 'frontoffice-auth',
      testDir: './src/tests/auth',
      use: {
        ...devices['Desktop Chrome'],
        // Sin storageState: estos tests necesitan arrancar sin sesión
        // (login, registro) — heredar CUSTOMER_AUTH_FILE los rompe, ya
        // que la página de login redirige directo a "Su cuenta".
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
      name: 'mobile',
      testDir: './src/tests',
      // Mismo motivo que en 'frontoffice': auth/ no puede heredar sesión.
      testIgnore: ['**/admin/**', '**/api/**', '**/auth/**'],
      use: {
        ...devices['Pixel 7'],
        storageState: CUSTOMER_AUTH_FILE,
      },
    },
  ],
});
