import { test, expect } from '../../fixtures';

test.describe('Back Office — Listado de productos @admin @smoke', () => {
  test('filtrar por nombre devuelve resultados coincidentes', async ({ adminProductListPage }) => {
    await adminProductListPage.goto();
    await adminProductListPage.filterByName('shirt');

    expect(await adminProductListPage.getResultsCount()).toBeGreaterThan(0);
  });
});
