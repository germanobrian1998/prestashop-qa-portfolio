import { test, expect } from '../../fixtures';
import { CustomerFactory } from '../../factories/CustomerFactory';

/**
 * Sección 7 — Flujo de registro (UI → BD).
 *
 * ⚠️ SUPUESTOS SIN CONFIRMAR (marcar y revisar):
 * 1. Confirmación visual de registro exitoso: reuso el mismo locator que
 *    ya está confirmado en global-setup.ts para login
 *    (getByRole('link', { name: /cerrar sesión/i }).first()) — el
 *    registro también deja al cliente logueado, así que debería aplicar
 *    igual, pero no lo vi confirmado específicamente para este flujo.
 * 2. Mensaje de error de email duplicado: NO confirmado (no tengo el
 *    locator). Por eso el escenario de "no duplicados" valida solo a
 *    nivel de BD (conteo de filas por email), no el mensaje en pantalla.
 *    Si más adelante se confirma el locator, se puede sumar esa aserción
 *    de UI sin tocar la de BD.
 */

test.describe('DB — Flujo de registro @db @regression', () => {
  test('registro vía UI crea el customer en ps_customer con campos correctos y password hasheado', async ({
    page,
    registerPage,
    dbClient,
  }) => {
    const customer = CustomerFactory.create();

    await registerPage.goto();
    await registerPage.register(customer);

    // Confirmación de que el registro completó y dejó al cliente logueado
    // (supuesto #1 de arriba).
    await page.getByRole('link', { name: /cerrar sesión/i }).first().waitFor({ state: 'visible' });

    const row = await dbClient.queryOne<{
      id_customer: number;
      firstname: string;
      lastname: string;
      email: string;
      passwd: string;
      active: number;
      deleted: number;
      date_add: string;
    }>('SELECT id_customer, firstname, lastname, email, passwd, active, deleted, date_add FROM ps_customer WHERE email = ?', [
      customer.email,
    ]);

    expect(row, `No se encontró en ps_customer ningún registro con email ${customer.email}`).not.toBeNull();
    expect(row!.firstname).toBe(customer.firstName);
    expect(row!.lastname).toBe(customer.lastName);
    expect(row!.email).toBe(customer.email);

    // El password nunca debe guardarse en texto plano.
    expect(row!.passwd).not.toBe(customer.password);
    // PrestaShop usa bcrypt — el hash siempre arranca con "$2y$".
    expect(row!.passwd).toMatch(/^\$2y\$/);

    expect(row!.active).toBe(1);
    expect(row!.deleted).toBe(0);
    expect(row!.date_add).toBeTruthy();
  });

  test('no se crean registros duplicados para el mismo email', async ({
    page,
    registerPage,
    dbClient,
  }) => {
    const customer = CustomerFactory.create();

    // Primer registro: debería crear el customer normalmente.
    await registerPage.goto();
    await registerPage.register(customer);
    await page.getByRole('link', { name: /cerrar sesión/i }).first().waitFor({ state: 'visible' });

    const countAfterFirst = await dbClient.query<{ total: number }>(
      'SELECT COUNT(*) AS total FROM ps_customer WHERE email = ?',
      [customer.email]
    );
    expect(countAfterFirst[0].total).toBe(1);

    // Segundo intento con el mismo email: PrestaShop debería rechazarlo
    // (no confirmado el mensaje de UI — ver supuesto #2). Lo que sí
    // validamos con certeza es que no aparece una fila nueva en BD.
    await page.context().clearCookies();
    await registerPage.goto();
    await registerPage.register(CustomerFactory.create({ email: customer.email }));

    const countAfterSecond = await dbClient.query<{ total: number }>(
      'SELECT COUNT(*) AS total FROM ps_customer WHERE email = ?',
      [customer.email]
    );
    expect(
      countAfterSecond[0].total,
      `Se esperaba 1 sola fila en ps_customer para ${customer.email} tras el segundo intento de registro, hay ${countAfterSecond[0].total}`
    ).toBe(1);
  });
});
