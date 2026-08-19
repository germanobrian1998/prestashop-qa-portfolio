import { test, expect } from '../../fixtures';
import { CustomerFactory } from '../../factories/CustomerFactory';

/**
 * Sección 7 — Flujo de orden (UI → BD).
 *
 * FIX 2026-08-18: los 3 tests decrementan stock del mismo id_product=1
 * — bajo ejecución paralela colisionaban entre sí (confirmado en CI:
 * "Stock esperado: 2399, real: 2397"). Fix combinado: (a) cliente
 * aislado por test vía CustomerFactory + RegisterPage, igual que
 * carrito.spec.ts — no evita la colisión de stock por sí solo, pero
 * elimina cualquier colisión de sesión/carrito entre los 3 tests; (b)
 * describe.configure({ mode: 'serial' }) para que los 3 tests de este
 * archivo nunca corran al mismo tiempo, eliminando la carrera sobre
 * ps_stock_available. Válido porque el job db-testing corre
 * --project=db en aislamiento (ver qa.yml) — ningún otro proyecto
 * compite por id_product=1 en simultáneo dentro de esa corrida.
 *
 * ⚠️ SUPUESTOS SIN CONFIRMAR (marcar y revisar):
 * 1. RegisterPage.register() deja al cliente logueado inmediatamente
 *    tras el submit.
 * 2. Producto demo id_product=1 sin combinaciones obligatorias.
 * 3. total_paid / total_paid_tax_incl almacenan el mismo valor.
 * 4. Si en algún momento se agregan MÁS specs al proyecto `db` que
 *    también toquen id_product=1 (o si db-testing deja de correr
 *    aislado de otros proyectos), este describe.serial deja de ser
 *    suficiente — revisar esta nota si vuelve a aparecer el mismo tipo
 *    de fallo.
 */

const PRODUCT_ID = 1;
const BANKWIRE_AWAITING_STATE_ID = 10; // "En espera de pago por transferencia bancaria"

test.describe('DB — Flujo de orden @db @regression', () => {
  test.describe.configure({ mode: 'serial' });

  test('total_paid coincide con la suma de líneas (unit_price × quantity) más envío', async ({
    registerPage,
    checkoutFacade,
    dbClient,
  }) => {
    const customer = CustomerFactory.create();
    await registerPage.goto();
    await registerPage.register(customer);

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

    expect(Number(order!.total_paid_tax_incl)).toBeCloseTo(expectedTotal, 2);
    expect(Number(order!.total_paid)).toBeCloseTo(expectedTotal, 2);
  });

  test('ps_stock_available.quantity se decrementa correctamente tras confirmar la orden', async ({
    registerPage,
    checkoutFacade,
    dbClient,
  }) => {
    const stockQuery =
      'SELECT quantity FROM ps_stock_available WHERE id_product = ? AND id_product_attribute = 0';

    const before = await dbClient.queryOne<{ quantity: number }>(stockQuery, [PRODUCT_ID]);
    expect(before, `No se encontró ps_stock_available para id_product=${PRODUCT_ID}`).not.toBeNull();

    const customer = CustomerFactory.create();
    await registerPage.goto();
    await registerPage.register(customer);

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
    registerPage,
    checkoutFacade,
    dbClient,
  }) => {
    const customer = CustomerFactory.create();
    await registerPage.goto();
    await registerPage.register(customer);

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