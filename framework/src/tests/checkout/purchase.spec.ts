import { test, expect } from '../../fixtures';
import { CustomerFactory } from '../../factories/CustomerFactory';

test.describe('Front Office — Checkout completo @checkout @smoke', () => {
  test('cliente registrado completa una compra con transferencia bancaria', async ({
    checkoutFacade,
  }) => {
    const customer = CustomerFactory.create({
      email: process.env.TEST_CUSTOMER_EMAIL,
    });

    const result = await checkoutFacade.completePurchase(customer, 1, { method: 'bankwire' });

    expect(result.confirmed).toBe(true);
    expect(result.orderReference).not.toBe('');
  });
});
