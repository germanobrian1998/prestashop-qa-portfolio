import { test, expect } from '../../fixtures';
import { CustomerFactory } from '../../factories/CustomerFactory';

/**
 * Sección 7 — Flujo de orden (UI → BD). Los tres escenarios pedidos por
 * el Archivo 2: total_paid vs. suma de líneas + envío, decremento de
 * stock, y current_state inicial tras checkout con transferencia
 * bancaria. Severidad P0 si alguno falla (afecta valores monetarios o
 * stock — criterio ya establecido en el proyecto).
 *
 * ⚠️ SUPUESTOS SIN CONFIRMAR (marcar y revisar):
 * 1. TEST_CUSTOMER_EMAIL / TEST_CUSTOMER_PASSWORD existen en .env
 *    (documentados en Sección 5 del Archivo 2), pero no confirmado con
 *    un grep real en esta sesión. Si el login falla acá, es lo primero
 *    a chequear.
 * 2. Producto demo id_product=1 sin combinaciones (id_product_attribute
 *    = 0) — mismo supuesto que ya usa helpers.ts de Sección 5.1.
 * 3. total_paid / total_paid_tax_incl almacenan el mismo valor (tax
 *    incl) en esta instancia — comportamiento típico de PrestaShop con
 *    configuración default de PS_TAX_ADDRESS_TYPE, no confirmado contra
 *    esta instancia puntual. Si el assert de total_paid (no
 *    total_paid_tax_incl) falla pero el otro pasa, es señal de que la
 *    instancia calcula impuestos distinto y hay que separar los dos
 *    casos.
 * 4. CheckoutFacade.completePurchase() asume storageState de cliente ya
 *    logueado (ver su propio docstring) — el proyecto 'db' NO tiene
 *    storageState (a propósito, lo necesita registro.spec.ts para
 *    arrancar deslogueado). Por eso acá se loguea explícito con
 *    LoginPage antes de cada compra, mismo patrón que checkout-bdd.
 *
 * NOTA DE CONCURRENCIA: el test de stock lee/escribe sobre el mismo
 * producto (id_product=1) que probablemente usan otros specs de checkout
 * (purchase.spec.ts, dummy-payment-states.spec.ts). Si se corre este
 * archivo en paralelo con esos, el decremento esperado podría no
 * coincidir por movimientos de stock concurrentes ajenos a este test.
 * Corrida aislada (--project=db, sin correr junto a frontoffice/mobile)
 * es la forma confiable de validarlo.
 */

const PRODUCT_ID = 1;
const BANKWIRE_AWAITING_STATE_ID = 10; // "En espera de pago por transferencia bancaria" — confirmado en ps_order_state_lang

async function loginTestCustomer(loginPage: import('../../pages/frontoffice/LoginPage').LoginPage) {
  const email = process.env.TEST_CUSTOMER_EMAIL ?? '';
  const password = process.env.TEST_CUSTOMER_PASSWORD ?? '';
  if (!email || !password) {
    throw new Error('TEST_CUSTOMER_EMAIL / TEST_CUSTOMER_PASSWORD no están definidas en .env');
  }
  await loginPage.goto();
  await loginPage.login(email, password);
}

test.describe('DB — Flujo de orden @db @regression', () => {
  test('total_paid coincide con la suma de líneas (unit_price × quantity) más envío', async ({
    loginPage,
    checkoutFacade,
    dbClient,
  }) => {
    await loginTestCustomer(loginPage);

    const customer = CustomerFactory.create({ email: process.env.TEST_CUSTOMER_EMAIL });
    const quantity = 2;
    const { confirmed, orderReference } = await checkoutFacade.completePurchase(
      customer,
      PRODUCT_ID,
      { method: 'bankwire' },
      quantity
    );
    expect(confirmed, 'El checkout debería confirmar la orden').toBe(true);

    const order = await dbClient.queryOne<{
      id_order: number;
      total_paid: string;
      total_paid_tax_incl: string;
      total_shipping_tax_incl: string;
    }>(
      'SELECT id_order, total_paid, total_paid_tax_incl, total_shipping_tax_incl FROM ps_orders WHERE reference = ?',
      [orderReference]
    );
    expect(order, `No se encontró en ps_orders ninguna orden con reference ${orderReference}`).not.toBeNull();

    const lines = await dbClient.query<{ total_price_tax_incl: string }>(
      'SELECT total_price_tax_incl FROM ps_order_detail WHERE id_order = ?',
      [order!.id_order]
    );
    expect(lines.length, 'Debería haber al menos una línea en ps_order_detail').toBeGreaterThan(0);

    const sumLines = lines.reduce((acc, line) => acc + Number(line.total_price_tax_incl), 0);
    const expectedTotal = sumLines + Number(order!.total_shipping_tax_incl);

    // Comparación con 2 decimales de tolerancia (redondeo de moneda).
    expect(Number(order!.total_paid_tax_incl)).toBeCloseTo(expectedTotal, 2);
    expect(Number(order!.total_paid)).toBeCloseTo(expectedTotal, 2);
  });

  test('ps_stock_available.quantity se decrementa correctamente tras confirmar la orden', async ({
    loginPage,
    checkoutFacade,
    dbClient,
  }) => {
    const stockQuery =
      'SELECT quantity FROM ps_stock_available WHERE id_product = ? AND id_product_attribute = 0';

    const before = await dbClient.queryOne<{ quantity: number }>(stockQuery, [PRODUCT_ID]);
    expect(before, `No se encontró ps_stock_available para id_product=${PRODUCT_ID}`).not.toBeNull();

    await loginTestCustomer(loginPage);
    const customer = CustomerFactory.create({ email: process.env.TEST_CUSTOMER_EMAIL });
    const quantity = 1;
    const { confirmed } = await checkoutFacade.completePurchase(
      customer,
      PRODUCT_ID,
      { method: 'bankwire' },
      quantity
    );
    expect(confirmed, 'El checkout debería confirmar la orden').toBe(true);

    const after = await dbClient.queryOne<{ quantity: number }>(stockQuery, [PRODUCT_ID]);
    expect(after, `No se encontró ps_stock_available para id_product=${PRODUCT_ID} tras la compra`).not.toBeNull();

    expect(
      after!.quantity,
      `Stock esperado: ${before!.quantity - quantity} (${before!.quantity} - ${quantity}), real: ${after!.quantity}`
    ).toBe(before!.quantity - quantity);
  });

  test('current_state inicial corresponde a "Awaiting bankwire payment" inmediatamente después del checkout', async ({
    loginPage,
    checkoutFacade,
    dbClient,
  }) => {
    await loginTestCustomer(loginPage);

    const customer = CustomerFactory.create({ email: process.env.TEST_CUSTOMER_EMAIL });
    const { confirmed, orderReference } = await checkoutFacade.completePurchase(
      customer,
      PRODUCT_ID,
      { method: 'bankwire' },
      1
    );
    expect(confirmed, 'El checkout debería confirmar la orden').toBe(true);

    const order = await dbClient.queryOne<{ current_state: number }>(
      'SELECT current_state FROM ps_orders WHERE reference = ?',
      [orderReference]
    );
    expect(order, `No se encontró en ps_orders ninguna orden con reference ${orderReference}`).not.toBeNull();

    expect(
      order!.current_state,
      `Se esperaba current_state=${BANKWIRE_AWAITING_STATE_ID} (En espera de pago por transferencia bancaria), fue ${order!.current_state}`
    ).toBe(BANKWIRE_AWAITING_STATE_ID);
  });
});
