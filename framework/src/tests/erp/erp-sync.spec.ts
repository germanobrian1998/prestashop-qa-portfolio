/**
 * Sección 5.2 — Mock de ERP: escenarios de resiliencia.
 *
 * ⚠️ SIN VERIFICAR CONTRA LA INSTANCIA REAL (ver README de esta carpeta).
 *
 * Esta spec usa una `FakeProductsApi` en memoria en vez del ProductsApi
 * real del framework (que ya está mergeado a main y no está disponible en
 * esta conversación). El objetivo de este archivo es probar la LÓGICA de
 * resiliencia de ErpSyncService (qué hace ante datos inválidos, timeouts,
 * desfasaje) de forma rápida y determinística, sin depender de que la
 * instancia Docker esté levantada.
 *
 * Falta un segundo bloque (marcado @integration más abajo, comentado)
 * que reemplace FakeProductsApi por el ProductsApi real y corra contra
 * PrestaShop de verdad -- eso sí requiere Webservice activo y no se pudo
 * ejecutar ni una vez en esta sesión.
 */
import { test, expect } from '@playwright/test';
import { ErpMockClient } from '../../api/ErpMockClient';
import { ErpSyncService, ProductsApiLike } from '../../services/ErpSyncService';
import erpSkus from '../../test-data/erp-skus.json';

const ERP_MOCK_URL = process.env.ERP_MOCK_URL ?? 'http://localhost:4000';
const ERP_MOCK_CONTROL_TOKEN = process.env.ERP_MOCK_CONTROL_TOKEN ?? 'local-only-token';
const PRIMARY_SKU = erpSkus.primarySku;

class FakeProductsApi implements ProductsApiLike {
  stock = new Map<string, number>();
  prices = new Map<string, number>();
  knownSkus: Set<string>;

  constructor(seedSkus: string[]) {
    this.knownSkus = new Set(seedSkus);
  }

  async updateStock(sku: string, quantity: number): Promise<void> {
    this.stock.set(sku, quantity);
  }

  async updatePrice(sku: string, price: number): Promise<void> {
    this.prices.set(sku, price);
  }

  async skuExists(sku: string): Promise<boolean> {
    return this.knownSkus.has(sku);
  }
}

test.describe('@regression @api ERP sync resilience', () => {
  test.describe.configure({ mode: 'serial' });
  let erpClient: ErpMockClient;

  test.beforeEach(async () => {
    erpClient = new ErpMockClient({
      baseUrl: ERP_MOCK_URL,
      controlToken: ERP_MOCK_CONTROL_TOKEN,
      requestTimeoutMs: 3000,
    });
    await erpClient.resetScenarios();
  });

  test('stock desactualizado: el snapshot stale no se pisa con mutaciones posteriores', async () => {
    // Congela el snapshot en el valor actual.
    await erpClient.setScenario({ resource: 'stock', mode: 'stale' });
    const { item: beforeMutation } = await erpClient.getStock(PRIMARY_SKU);

    // Muta la "verdad" del ERP -- el snapshot no debería moverse.
    await erpClient.mutate(PRIMARY_SKU, { quantity: beforeMutation.quantity + 999 });

    const { item: afterMutation, source } = await erpClient.getStock(PRIMARY_SKU);
    expect(source).toBe('stale-snapshot');
    expect(afterMutation.quantity).toBe(beforeMutation.quantity);
  });

  test('timeout en modo "hang": el cliente corta por su propio timeout', async () => {
    await erpClient.setScenario({
      resource: 'stock',
      mode: 'timeout',
      timeoutBehavior: 'hang',
    });

    await expect(erpClient.getAllStock()).rejects.toThrow();
  });

  test('timeout en modo "reset": la conexión se corta inmediatamente', async () => {
    await erpClient.setScenario({
      resource: 'stock',
      mode: 'timeout',
      timeoutBehavior: 'reset',
    });

    await expect(erpClient.getAllStock()).rejects.toThrow();
  });

  test('datos inconsistentes: precio negativo nunca llega a PrestaShop', async () => {
    await erpClient.setScenario({ resource: 'prices', mode: 'inconsistent', targetSku: PRIMARY_SKU });

    const fakeProductsApi = new FakeProductsApi(erpSkus.skus);
    const syncService = new ErpSyncService(erpClient, fakeProductsApi);

    const report = await syncService.syncPrices();

    const skippedEntry = report.results.find((r) => r.sku === PRIMARY_SKU);
    expect(skippedEntry?.action).toBe('skipped_invalid_data');
    expect(fakeProductsApi.prices.has(PRIMARY_SKU)).toBe(false);
  });

  test('datos inconsistentes: SKU inexistente no rompe el resto del batch', async () => {
    await erpClient.setScenario({ resource: 'stock', mode: 'inconsistent', targetSku: PRIMARY_SKU });

    const fakeProductsApi = new FakeProductsApi(erpSkus.skus);
    const syncService = new ErpSyncService(erpClient, fakeProductsApi);

    const report = await syncService.syncStock();

    // El SKU corrompido se salta...
    const corrupted = report.results.find((r) => r.sku === PRIMARY_SKU);
    expect(corrupted?.action).toBe('skipped_invalid_data');

    // ...pero el resto del batch se sincroniza igual.
    const others = report.results.filter((r) => r.sku !== PRIMARY_SKU);
    expect(others.some((r) => r.action === 'updated_stock')).toBe(true);
  });

  test('reconciliación: tras reset, el siguiente sync refleja el valor real', async () => {
    await erpClient.setScenario({ resource: 'stock', mode: 'stale' });
    const { item: staleValue } = await erpClient.getStock(PRIMARY_SKU);

    const newQuantity = staleValue.quantity + 15;
    await erpClient.mutate(PRIMARY_SKU, { quantity: newQuantity });

    const fakeProductsApi = new FakeProductsApi(erpSkus.skus);
    const syncService = new ErpSyncService(erpClient, fakeProductsApi);

    // Primer sync: todavía viendo el snapshot viejo.
    await syncService.syncStock();
    expect(fakeProductsApi.stock.get(PRIMARY_SKU)).toBe(staleValue.quantity);

    // Se restablece la conexión con el ERP.
    await erpClient.resetScenarios();

    // Segundo sync: ahora sí debería reflejar el valor real.
    await syncService.syncStock();
    expect(fakeProductsApi.stock.get(PRIMARY_SKU)).toBe(newQuantity);
  });
});
