import { test, expect } from '../../fixtures';

test.describe('Front Office — Carrito @cart @smoke', () => {
  test('agregar un producto actualiza el conteo de líneas del carrito', async ({
    productPage,
    cartPage,
  }) => {
    await productPage.gotoById(1);
    await productPage.setQuantity(1);
    await productPage.addToCart();

    await cartPage.goto();
    expect(await cartPage.getLineItemsCount()).toBeGreaterThan(0);
  });
});
