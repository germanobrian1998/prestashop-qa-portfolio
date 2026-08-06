import { test, expect } from '../../fixtures';

test.describe('Webservice API — Products @api @smoke', () => {
  test('GET /api/products responde 200 con el catálogo', async ({ productsApi }) => {
    const { status, body } = await productsApi.list();

    expect(status).toBe(200);
    expect(Array.isArray(body.products)).toBe(true);
    expect(body.products.length).toBeGreaterThan(0);
  });

  test('GET /api/products/:id responde con el detalle completo', async ({ productsApi }) => {
    const { status, body } = await productsApi.getById(1);

    expect(status).toBe(200);
    // La instancia real devuelve el detalle envuelto en la misma clave
    // plural del listado ({"products":[{...}]}), no en "product" singular
    // como sugiere la documentación de PrestaShop — confirmado con curl
    // directo. ProductsApi.ts se mantiene fiel a esta forma real a
    // propósito, sin normalizar, para no ocultar la particularidad de
    // cara a OrdersApi (Secciones 6/7), que probablemente comparta el
    // mismo patrón — a confirmar con curl antes de asumir "order" singular.
    expect(body.products?.[0]).toBeDefined();
    expect(body.products[0].id).toBe(1);
  });
});
