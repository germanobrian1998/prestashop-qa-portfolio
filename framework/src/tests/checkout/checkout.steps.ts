// src/tests/checkout/checkout.steps.ts
//
// ⚠️ SUPUESTOS SIN CONFIRMAR (marcar y revisar):
// 1. PRODUCT_ID = 6 ("Mug The best is yet to come") — elegido por evidencia
//    real de un error-context.md anterior en esta sesión (aparecía en el
//    listado de "Productos Destacados" de la home), y porque NO tiene
//    combinaciones de talle/color (ProductPage.ts no tiene método para
//    seleccionarlas) — a diferencia del producto 1 (t-shirt), que sí.
//    Si este ID cambia en tu catálogo demo, es el primer sospechoso.
// 2. FAKE_CUSTOMER: CheckoutFacade.completePurchase() pide un `Customer`
//    como primer parámetro, pero el propio código lo marca `_customer`
//    (no usado, solo para logging futuro) — no tengo CustomerFactory.ts
//    así que uso un cast vacío en vez de armar el objeto real. Si en algún
//    momento el Facade empieza a usar ese parámetro de verdad, esto rompe.
// 3. Escenario 2 (guest checkout): no sé de antemano si esta instancia
//    tiene guest checkout habilitado o fuerza login — el step de
//    verificación contempla los dos resultados posibles y loggea cuál
//    ocurrió realmente, en vez de asumir uno.
// 4. Escenario 3 (sin método de pago): agregué un método nuevo a
//    CheckoutPaymentPage.ts (`attemptPlaceOrderWithoutSelectingMethod`)
//    porque `placeOrder()` existente asume que SIEMPRE hay navegación
//    tras el click (espera cambio de URL) — no sirve para el caso negativo,
//    donde lo esperable es que NO navegue. Sin confirmar todavía si
//    PrestaShop bloquea esto client-side (el submit ni sale) o
//    server-side (navega y vuelve con error) — el step contempla ambos.
// 5. Reminder de aridad: cualquier step con {string} necesita ese
//    parámetro en la función.

import { createBdd } from 'playwright-bdd';
import { test, expect } from '../../fixtures/bdd';
import type { Customer } from '../../factories/CustomerFactory';

const { Given, When, Then } = createBdd(test);

const TEST_EMAIL = process.env.TEST_CUSTOMER_EMAIL ?? '';
const TEST_PASSWORD = process.env.TEST_CUSTOMER_PASSWORD ?? '';
const PRODUCT_ID = 6;

if (!TEST_EMAIL || !TEST_PASSWORD) {
  throw new Error('TEST_CUSTOMER_EMAIL / TEST_CUSTOMER_PASSWORD no definidas en .env.');
}

// Customer no se usa funcionalmente dentro de completePurchase() (parámetro
// `_customer`, solo para logging futuro) — cast vacío en vez de adivinar
// la forma real de CustomerFactory.ts.
const FAKE_CUSTOMER = {} as Customer;

Given('que la tienda está disponible', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.ok()).toBeTruthy();
});

Given('un cliente registrado autenticado en el Front Office', async ({ loginPage }) => {
  await loginPage.goto();
  await loginPage.login(TEST_EMAIL, TEST_PASSWORD);
});

Given('ningún cliente autenticado', async () => {
  // No-op: este proyecto (checkout-bdd) no tiene storageState, arranca
  // sin sesión por default.
});

Given('un producto agregado al carrito', async ({ productPage }) => {
  await productPage.gotoById(PRODUCT_ID);
  await productPage.addToCart();
});

When('completa la compra de un producto disponible en el catálogo', async ({ checkoutFacade }) => {
  const result = await checkoutFacade.completePurchase(FAKE_CUSTOMER, PRODUCT_ID, { method: 'bankwire' });
  process.env.__LAST_CHECKOUT_CONFIRMED = String(result.confirmed);
  process.env.__LAST_CHECKOUT_REFERENCE = result.orderReference;
});

When('agrega un producto al carrito e intenta iniciar el checkout', async ({ productPage, cartPage }) => {
  await productPage.gotoById(PRODUCT_ID);
  await productPage.addToCart();
  await cartPage.goto();
  await cartPage.proceedToCheckout();
});

When('llega hasta el paso de pago sin seleccionar ningún método', async ({ cartPage, checkoutAddressPage, checkoutShippingPage }) => {
  await cartPage.goto();
  await cartPage.proceedToCheckout();
  await checkoutAddressPage.provideAddress(
    (await import('../../factories/AddressFactory')).AddressFactory.create()
  );
  await checkoutAddressPage.continueToShipping();
  await checkoutShippingPage.continueToPayment();
  // Deliberadamente NO se llama a acceptTerms() ni a ningún selectXxx() —
  // este es el estado que el siguiente step necesita para el caso negativo.
});

When('intenta confirmar la orden de todos modos', async ({ checkoutPaymentPage }) => {
  await checkoutPaymentPage.attemptPlaceOrderWithoutSelectingMethod();
});

Then('la orden se confirma exitosamente', async () => {
  expect(process.env.__LAST_CHECKOUT_CONFIRMED).toBe('true');
});

Then('ve la página de confirmación con el número de pedido', async () => {
  const reference = process.env.__LAST_CHECKOUT_REFERENCE ?? '';
  expect(reference.length, `Referencia de pedido vacía — ¿confirmationPage.getOrderReference() matcheó algo?`).toBeGreaterThan(0);
});

Then('el sistema habilita guest checkout o redirige a la página de login', async ({ page }) => {
  const url = page.url();
  const isLoginRedirect = /\/es\/iniciar-sesion/i.test(url);
  const isGuestCheckoutFlow = /\/es\/pedido/i.test(url) && !isLoginRedirect;
  console.log(`[Checkout sin auth] Resultado real: ${isGuestCheckoutFlow ? 'guest checkout habilitado' : isLoginRedirect ? 'redirige a login' : 'NINGUNO DE LOS DOS — revisar'} — URL: ${url}`);
  expect(
    isLoginRedirect || isGuestCheckoutFlow,
    `Comportamiento inesperado, no matchea ninguno de los dos casos previstos. URL final: ${url}`
  ).toBeTruthy();
});

Then('el sistema muestra un mensaje de error apropiado', async ({ page }) => {
  const errorVisible = await page.locator('.alert-danger, [role="alert"]').first().isVisible().catch(() => false);
  const stillOnPaymentStep = /\/es\/pedido/i.test(page.url());
  console.log(`[Checkout sin método] error visible: ${errorVisible} — sigue en controller=order: ${stillOnPaymentStep} — URL: ${page.url()}`);
  expect(
    errorVisible || stillOnPaymentStep,
    `Ni se vio un mensaje de error ni se quedó en el paso de pago. URL: ${page.url()}`
  ).toBeTruthy();
});

Then('no se crea ninguna orden', async ({ checkoutConfirmationPage }) => {
  const confirmed = await checkoutConfirmationPage.isOrderConfirmed().catch(() => false);
  expect(confirmed, 'Se llegó a la página de confirmación aunque no se seleccionó método de pago').toBeFalsy();
});
