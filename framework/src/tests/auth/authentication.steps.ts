// src/tests/auth/authentication.steps.ts
//
// ⚠️ SUPUESTOS SIN CONFIRMAR CONTRA EL FRAMEWORK REAL (marcar y revisar):
// 1. [RESUELTO] createBdd() necesitaba un `test` extendido desde el propio
//    'test' de playwright-bdd. Resuelto con src/fixtures/bdd.ts.
// 2. [RESUELTO con evidencia real] getErrorMessage() usaba getByRole('alert'),
//    que no existe en el DOM real — es <ul class="alert alert-danger"><li>.
//    Corregido en LoginPage.ts a `.alert-danger`.
// 3. [RESUELTO con evidencia real] El login NO redirige a /mi-cuenta solo —
//    hace falta navegar ahí explícito (ver When de login exitoso).
// 4. [SIGUE SIN CONFIRMAR] El heading real de /mi-cuenta — el assert de esa
//    página quedó deliberadamente débil (URL + heading genérico) hasta
//    tener el DOM real. Fortalecer cuando llegue evidencia.
// 5. [CONFIRMADO con evidencia real] Rechazo de acceso a Back Office con
//    sesión de cliente: redirect a AdminLogin dentro del subpath — pasó
//    en la corrida real, ya no es supuesto.
// 6. El escenario de brute force NO asume que exista bloqueo: solo registra
//    el mensaje real. Con el locator ya corregido, si sigue devolviendo el
//    mismo "Error de autenticación." genérico tras varios intentos, ESO es
//    el hallazgo real (falta de rate limiting visible en UI) — no ajustar
//    el assert para que pase, documentar como gap en el bug report.
// 7. [NUEVO] Se agregó verificación de status HTTP (429/5xx) además del
//    mensaje de UI, para descartar bloqueo server-side sin reflejo visible
//    en el texto. Depende de LoginPage.login() devolviendo la Response del
//    POST — ⚠️ asume submit síncrono con navegación normal (no AJAX), sin
//    confirmar todavía contra el comportamiento real del form.

import { createBdd } from 'playwright-bdd';
// FIX: playwright-bdd necesita un `test` extendido desde su propio 'test'
// (no desde '@playwright/test' directo) — ver src/fixtures/bdd.ts para el detalle.
import { test, expect } from '../../fixtures/bdd';

const { Given, When, Then } = createBdd(test);

const TEST_EMAIL = process.env.TEST_CUSTOMER_EMAIL ?? '';
const TEST_PASSWORD = process.env.TEST_CUSTOMER_PASSWORD ?? '';

if (!TEST_EMAIL || !TEST_PASSWORD) {
  throw new Error(
    'TEST_CUSTOMER_EMAIL / TEST_CUSTOMER_PASSWORD no definidas en .env — ' +
    'confirmar que el cliente de test sigue existiendo tras el docker compose down -v.'
  );
}

Given('que la tienda está disponible', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.ok()).toBeTruthy();
});

Given('un cliente registrado con credenciales válidas', async () => {
  // No-op declarativo: las credenciales vienen de .env (TEST_CUSTOMER_*).
  // Se deja el step para legibilidad del feature file.
});

Given('un cliente registrado con email válido', async () => {
  // Idem — el email es TEST_EMAIL, solo cambia la password según el escenario.
});

Given('un cliente autenticado únicamente en el Front Office', async ({ loginPage }) => {
  // Login real por Front Office — este proyecto (frontoffice-auth) no tiene
  // storageState, así que hace falta loguearse de verdad acá, no asumir sesión.
  await loginPage.goto();
  await loginPage.login(TEST_EMAIL, TEST_PASSWORD);
});

When('el cliente inicia sesión con esas credenciales en el Front Office', async ({ loginPage, page }) => {
  await loginPage.goto();
  await loginPage.login(TEST_EMAIL, TEST_PASSWORD);
  // FIX confirmado con evidencia real: el login NO redirige automáticamente
  // a "Mi cuenta" — se queda en la home. Navego explícito para que el
  // siguiente Then tenga sentido.
  await page.goto('/mi-cuenta');
});

When('el cliente intenta iniciar sesión con una contraseña incorrecta', async ({ loginPage }) => {
  await loginPage.goto();
  await loginPage.login(TEST_EMAIL, 'password-incorrecta-QA-2026');
});

When(
  'el cliente intenta iniciar sesión con contraseña incorrecta {int} veces consecutivas',
  async ({ loginPage }, intentos: number) => {
    await loginPage.goto();
    let lastErrorMessage = '';
    let lastStatus: number | null = null;
    for (let i = 0; i < intentos; i++) {
      // login() ya captura y devuelve la response del POST (ver LoginPage.ts)
      // — evito duplicar el waitForResponse acá.
      const response = await loginPage.login(TEST_EMAIL, `password-incorrecta-${i}`);
      lastStatus = response?.status() ?? null;
      lastErrorMessage = await loginPage.getErrorMessage();
    }
    // Se guarda para el step de verificación posterior.
    process.env.__LAST_BRUTE_FORCE_MESSAGE = lastErrorMessage;
    process.env.__LAST_BRUTE_FORCE_STATUS = lastStatus !== null ? String(lastStatus) : '';
  }
);

When('intenta acceder directamente a una URL del Back Office', async ({ page }) => {
  // FIX: el proyecto 'frontoffice-auth' NO tiene baseURL de admin (a
  // diferencia del proyecto 'backoffice', que usa `${BASE_URL}/${ADMIN_FOLDER}/`
  // con barra final obligatoria — ver playwright.config.ts). Un path relativo
  // que arranca con '/' se resolvería contra BASE_URL y perdería el subpath
  // del admin folder real, mismo patrón de bug ya visto en WebserviceClient.
  const adminFolder = process.env.PS_FOLDER_ADMIN ?? 'admin-qa';
  const baseUrl = process.env.BASE_URL ?? 'http://localhost';
  await page.goto(`${baseUrl}/${adminFolder}/index.php?controller=AdminProducts`);
});

Then('el sistema le concede acceso', async ({ loginPage }) => {
  expect(await loginPage.isLoggedIn()).toBeTruthy();
});

Then('la página de {string} muestra su información', async ({ page }, _seccion: string) => {
  // FIX: saqué el heading adivinado "Mi cuenta"/"My account" — estaba mal,
  // y no tengo capturado el DOM real de /mi-cuenta todavía para poner uno
  // certero. Este assert es deliberadamente más débil (URL correcta + la
  // página renderiza un heading real, no un error) hasta tener esa evidencia.
  // Si quiere un assert más específico, mándeme el error-context.md de esta
  // corrida o el HTML de /mi-cuenta y lo ajusto al texto real.
  await expect(page).toHaveURL(/mi-cuenta/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

Then('el sistema rechaza el acceso', async ({ loginPage }) => {
  expect(await loginPage.isLoggedIn()).toBeFalsy();
});

Then('el mensaje de error es genérico y no revela si el email existe en el sistema', async ({ loginPage }) => {
  const message = await loginPage.getErrorMessage();
  expect(message.toLowerCase()).not.toMatch(/no existe|not found|unknown email/i);
});

Then('el sistema debería aplicar alguna forma de rate limiting o bloqueo temporal', async () => {
  // ⚠️ Este assert es intencionalmente el que va a determinar el hallazgo real.
  // Si PrestaShop core no bloquea nada (ni en el mensaje de UI ni en el status
  // HTTP), este test va a FALLAR — eso es correcto: no ajustar el assert para
  // forzar que pase, documentar como gap/bug (Sección 11).
  const message = (process.env.__LAST_BRUTE_FORCE_MESSAGE ?? '').toLowerCase();
  const status = process.env.__LAST_BRUTE_FORCE_STATUS ?? '';
  const messageIndicatesBlock = /bloque|blocked|too many|intentos|rate limit/i.test(message);
  // 429 = Too Many Requests explícito. 5xx se incluye porque un bloqueo mal
  // implementado a veces se manifiesta como error de servidor en vez de un
  // 429 correcto — vale la pena que el test lo capture igual como señal.
  const statusIndicatesBlock = status === '429' || status.startsWith('5');
  expect(
    messageIndicatesBlock || statusIndicatesBlock,
    `Sin señal de bloqueo. Mensaje UI: "${message}" — Status HTTP del último intento: ${status}`
  ).toBeTruthy();
});

Then('documentar el comportamiento real observado si no lo hay', async () => {
  // Step deliberadamente no-assertivo: solo deja constancia en el reporte
  // del mensaje y status real capturados, para el bug report si el step anterior falló.
  console.log(
    'Último intento tras brute force — mensaje UI:', process.env.__LAST_BRUTE_FORCE_MESSAGE,
    '| status HTTP:', process.env.__LAST_BRUTE_FORCE_STATUS
  );
});

Then('no expone ningún contenido ni menú administrativo', async ({ page }) => {
  // ASUNCIÓN todavía sin confirmar: rechazo se manifiesta como redirect
  // al login de admin dentro del mismo subpath. Ajustar si el comportamiento
  // real es un 403 explícito u otra pantalla.
  const adminFolder = process.env.PS_FOLDER_ADMIN ?? 'admin-qa';
  await expect(page).toHaveURL(new RegExp(`${adminFolder}.*controller=AdminLogin`, 'i'));
});
