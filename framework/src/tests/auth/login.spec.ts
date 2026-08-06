import { test, expect } from '../../fixtures';
import customers from '../../test-data/customers.json';

test.describe('Front Office — Login @auth @smoke', () => {
  test('login exitoso con credenciales válidas', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login(
      process.env.TEST_CUSTOMER_EMAIL!,
      process.env.TEST_CUSTOMER_PASSWORD!
    );
    expect(await loginPage.isLoggedIn()).toBe(true);
  });

  test('login fallido con contraseña incorrecta muestra error genérico', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login(process.env.TEST_CUSTOMER_EMAIL!, 'contraseña-incorrecta');
    expect(await loginPage.isLoggedIn()).toBe(false);
    expect(await loginPage.getValidationError()).toBeTruthy();
  });
});

test.describe('Front Office — Registro @auth @regression', () => {
  for (const data of customers.filter((c) => c.case !== 'cliente_valido_ar')) {
    test(`registro rechazado: ${data.case}`, async ({ registerPage }) => {
      await registerPage.goto();
      await registerPage.register({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: data.password,
      });

      const error = await registerPage.getValidationError();
      expect(error).toBeTruthy();
    });
  }
});
