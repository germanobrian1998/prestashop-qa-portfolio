import { test, expect } from '../../fixtures';
import { CustomerFactory } from '../../factories/CustomerFactory';

/**
 * Sección 7 — Flujo de carrito (UI → BD).
 *
 * FIX 2026-08-18: antes usaba TEST_CUSTOMER_EMAIL fijo compartido entre
 * los 2 tests de este archivo — bajo ejecución paralela (workers > 1),
 * ambos tests pisaban el mismo carrito del mismo cliente y los asserts
 * de id_cart fallaban por contención, no por un bug real (confirmado en
 * CI: "Expected: 6, Received: 7"). Fix: cada test registra su propio
 * cliente vía CustomerFactory + RegisterPage — carritos completamente
 * aislados entre tests, sin necesidad de serializar.
 *
 * ⚠️ SUPUESTOS SIN CONFIRMAR (marcar y revisar):
 * 1. RegisterPage.register() deja al cliente logueado inmediatamente
 *    tras el submit (comportamiento default de PrestaShop) — no se hace
 *    un login explícito después de registrar.
 * 2. Productos demo id_product=1 ("Hummingbird printed t-shirt") e
 *    id_product=2 ("Hummingbird printed sweater") sin combinaciones
 *    (id_product_attribute=0).
 * 3. CartPage.ts no expone ningún método de lectura de cantidad mostrada
 *    en un renglón (solo updateQuantity, que escribe).
 * 4. El carrito "actual" del cliente se identifica como el de
 *    MAX(date_upd) en ps_cart para su id_customer.
 * 5. "Cerrar sesión" (logout) no borra ni resetea el carrito.
 */

const PRODUCT_A_ID = 1; // Hummingbird printed t-shirt
const PRODUCT_B_ID = 2; // Hummingbird printed sweater

async function getCurrentCartId(
  dbClient: import('../../db/DbClient').DbClient,
  customerEmail: string
): Promise<number> {
  const customer = await dbClient.queryOne<{ id_customer: number }>(
    'SELECT id_customer FROM ps_customer WHERE email = ?',
    [customerEmail]
  );
  expect(customer, `No se encontró ps_customer para ${customerEmail}`).not.toBeNull();

  const cart = await dbClient.queryOne<{ id_cart: number }>(
    'SELECT id_cart FROM ps_cart WHERE id_customer = ? ORDER BY date_upd DESC LIMIT 1',
    [customer!.id_customer]
  );
  expect(cart, `No se encontró ningún ps_cart para id_customer=${customer!.id_customer}`).not.toBeNull();

  return cart!.id_cart;
}

test.describe('DB — Flujo de carrito @db @regression', () => {
  test('agregar productos distintos refleja las cantidades correctas en ps_cart_product', async ({
    registerPage,
    productPage,
    dbClient,
  }) => {
    // Cliente aislado por test — evita colisión de carrito bajo ejecución paralela.
    const customer = CustomerFactory.create();
    await registerPage.goto();
    await registerPage.register(customer);

    const quantityA = 2;
    const quantityB = 3;

    await productPage.gotoById(PRODUCT_A_ID);
    await productPage.setQuantity(quantityA);
    await productPage.addToCart();

    await productPage.gotoById(PRODUCT_B_ID);
    await productPage.setQuantity(quantityB);
    await productPage.addToCart();

    const cartId = await getCurrentCartId(dbClient, customer.email);

    const rows = await dbClient.query<{ id_product: number; quantity: number }>(
      'SELECT id_product, quantity FROM ps_cart_product WHERE id_cart = ? AND id_product IN (?, ?)',
      [cartId, PRODUCT_A_ID, PRODUCT_B_ID]
    );

    const rowA = rows.find((r) => r.id_product === PRODUCT_A_ID);
    const rowB = rows.find((r) => r.id_product === PRODUCT_B_ID);

    expect(rowA, `No se encontró línea de ps_cart_product para id_product=${PRODUCT_A_ID}`).toBeTruthy();
    expect(rowB, `No se encontró línea de ps_cart_product para id_product=${PRODUCT_B_ID}`).toBeTruthy();
    expect(rowA!.quantity).toBe(quantityA);
    expect(rowB!.quantity).toBe(quantityB);
  });

  test('un carrito abandonado persiste asociado al id_customer y se recupera al re-loguear', async ({
    page,
    registerPage,
    loginPage,
    productPage,
    dbClient,
  }) => {
    // Cliente aislado por test — mismo motivo que el test anterior.
    const customer = CustomerFactory.create();
    await registerPage.goto();
    await registerPage.register(customer);

    // 1. Agregar un producto, NO completar la compra.
    const quantity = 1;
    await productPage.gotoById(PRODUCT_A_ID);
    await productPage.setQuantity(quantity);
    await productPage.addToCart();

    const cartIdBeforeLogout = await getCurrentCartId(dbClient, customer.email);

    const rowsBeforeLogout = await dbClient.query<{ id_product: number; quantity: number }>(
      'SELECT id_product, quantity FROM ps_cart_product WHERE id_cart = ? AND id_product = ?',
      [cartIdBeforeLogout, PRODUCT_A_ID]
    );
    expect(rowsBeforeLogout.length, 'El producto debería estar en el carrito antes de cerrar sesión').toBe(1);

    // 2. "Abandonar" el carrito: cerrar sesión sin comprar.
    await page.getByRole('link', { name: /cerrar sesión/i }).first().click();

    // 3. Re-loguear con las credenciales del cliente recién registrado.
    await loginPage.goto();
    await loginPage.login(customer.email, customer.password);

    // 4. Confirmar en BD que el MISMO carrito (mismo id_cart) sigue
    // existiendo con la línea intacta — no que se haya creado uno nuevo.
    const cartIdAfterRelogin = await getCurrentCartId(dbClient, customer.email);
    expect(
      cartIdAfterRelogin,
      'El carrito debería seguir siendo el mismo id_cart tras re-loguear, no uno nuevo'
    ).toBe(cartIdBeforeLogout);

    const rowsAfterRelogin = await dbClient.query<{ id_product: number; quantity: number }>(
      'SELECT id_product, quantity FROM ps_cart_product WHERE id_cart = ? AND id_product = ?',
      [cartIdAfterRelogin, PRODUCT_A_ID]
    );
    expect(rowsAfterRelogin.length, 'El producto debería seguir en el carrito tras re-loguear').toBe(1);
    expect(rowsAfterRelogin[0].quantity).toBe(quantity);
  });
});