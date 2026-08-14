import { test, expect } from '../../fixtures';

/**
 * Sección 7 — Flujo de carrito (UI → BD). Cierra los dos escenarios
 * pedidos por el Archivo 2: cantidades en ps_cart_product vs. lo
 * agregado en UI, y persistencia/recuperación de un carrito abandonado
 * al re-loguear.
 *
 * ⚠️ SUPUESTOS SIN CONFIRMAR (marcar y revisar):
 * 1. TEST_CUSTOMER_EMAIL / TEST_CUSTOMER_PASSWORD en .env — mismo
 *    supuesto que orden.spec.ts.
 * 2. Productos demo id_product=1 ("Hummingbird printed t-shirt") e
 *    id_product=2 ("Hummingbird printed sweater") sin combinaciones
 *    (id_product_attribute=0) — confirmado el nombre/existencia contra
 *    la instancia real, pero NO confirmado si tienen combinaciones
 *    obligatorias (talle/color). Si ProductPage.addToCart() falla por
 *    necesitar seleccionar una variante primero, es la primera causa a
 *    revisar.
 * 3. CartPage.ts no expone ningún método de lectura de cantidad mostrada
 *    en un renglón (solo updateQuantity, que escribe). Por eso el primer
 *    escenario valida la cantidad que NOSOTROS seteamos al agregar
 *    (vía ProductPage.setQuantity(), ya confirmado que funciona porque
 *    lo usa CheckoutFacade) contra lo que queda en ps_cart_product — no
 *    es una comparación contra un valor leído de la UI, porque ese
 *    método no existe hoy. Si se agrega un getter de cantidad a
 *    CartPage más adelante, vale la pena sumar esa aserción extra.
 * 4. El carrito "actual" del cliente se identifica como el de
 *    MAX(date_upd) en ps_cart para su id_customer — no hay otro
 *    identificador expuesto por la UI/framework en este punto.
 * 5. "Cerrar sesión" (logout) no borra ni resetea el carrito — es lo que
 *    el propio escenario de negocio busca confirmar, así que no se da
 *    por sentado de antemano.
 */

const PRODUCT_A_ID = 1; // Hummingbird printed t-shirt
const PRODUCT_B_ID = 2; // Hummingbird printed sweater

async function loginTestCustomer(loginPage: import('../../pages/frontoffice/LoginPage').LoginPage) {
  const email = process.env.TEST_CUSTOMER_EMAIL ?? '';
  const password = process.env.TEST_CUSTOMER_PASSWORD ?? '';
  if (!email || !password) {
    throw new Error('TEST_CUSTOMER_EMAIL / TEST_CUSTOMER_PASSWORD no están definidas en .env');
  }
  await loginPage.goto();
  await loginPage.login(email, password);
}

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
    loginPage,
    productPage,
    dbClient,
  }) => {
    await loginTestCustomer(loginPage);

    const quantityA = 2;
    const quantityB = 3;

    await productPage.gotoById(PRODUCT_A_ID);
    await productPage.setQuantity(quantityA);
    await productPage.addToCart();

    await productPage.gotoById(PRODUCT_B_ID);
    await productPage.setQuantity(quantityB);
    await productPage.addToCart();

    const cartId = await getCurrentCartId(dbClient, process.env.TEST_CUSTOMER_EMAIL ?? '');

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
    loginPage,
    productPage,
    dbClient,
  }) => {
    const email = process.env.TEST_CUSTOMER_EMAIL ?? '';

    // 1. Login, agregar un producto, NO completar la compra.
    await loginTestCustomer(loginPage);
    const quantity = 1;
    await productPage.gotoById(PRODUCT_A_ID);
    await productPage.setQuantity(quantity);
    await productPage.addToCart();

    const cartIdBeforeLogout = await getCurrentCartId(dbClient, email);

    const rowsBeforeLogout = await dbClient.query<{ id_product: number; quantity: number }>(
      'SELECT id_product, quantity FROM ps_cart_product WHERE id_cart = ? AND id_product = ?',
      [cartIdBeforeLogout, PRODUCT_A_ID]
    );
    expect(rowsBeforeLogout.length, 'El producto debería estar en el carrito antes de cerrar sesión').toBe(1);

    // 2. "Abandonar" el carrito: cerrar sesión sin comprar.
    // No hay un método dedicado de logout en LoginPage — se usa el mismo
    // link "Cerrar sesión" cuya visibilidad ya confirma isLoggedIn().
    await page.getByRole('link', { name: /cerrar sesión/i }).first().click();

    // 3. Re-loguear.
    await loginTestCustomer(loginPage);

    // 4. Confirmar en BD que el MISMO carrito (mismo id_cart) sigue
    // existiendo con la línea intacta — no que se haya creado uno nuevo.
    const cartIdAfterRelogin = await getCurrentCartId(dbClient, email);
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
