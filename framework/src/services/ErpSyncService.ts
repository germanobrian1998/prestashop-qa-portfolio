import { ErpMockClient } from '../api/ErpMockClient';

/**
 * ⚠️ SUPUESTO SIN VERIFICAR: esta interfaz asume la forma de
 * `ProductsApi.ts` tal como quedó descripta en la Sección 5 (cliente
 * sobre WebserviceClient con Basic Auth). El archivo real ya está
 * mergeado a `main` y no se pudo confirmar contra esta conversación --
 * si los nombres de método difieren, ajustar solo esta interfaz
 * (Dependency Inversion: ErpSyncService no necesita cambiar).
 */
export interface ProductsApiLike {
  updateStock(sku: string, quantity: number): Promise<void>;
  updatePrice(sku: string, price: number): Promise<void>;
  skuExists(sku: string): Promise<boolean>;
}

export interface SyncResult {
  sku: string;
  action: 'updated_stock' | 'updated_price' | 'skipped_unknown_sku' | 'skipped_invalid_data';
  detail?: string;
}

export interface SyncReport {
  timestamp: string;
  results: SyncResult[];
  errors: string[];
}

/**
 * Orquesta la sincronización PrestaShop <- ERP mock.
 * Single Responsibility: esta clase solo decide QUÉ sincronizar y cómo
 * reaccionar ante datos inválidos; no sabe hablar HTTP con ninguno de los
 * dos lados (eso lo hacen ErpMockClient y ProductsApi).
 *
 * Reglas de resiliencia (ver Sección 5.2):
 * - Un precio negativo o un SKU inexistente en el ERP NUNCA se propaga a
 *   PrestaShop -- se registra como `skipped_invalid_data` /
 *   `skipped_unknown_sku` y se sigue con el resto del lote.
 * - Un error de red/timeout al hablar con el ERP no debe tirar abajo el
 *   proceso de sync completo -- se captura y se deja constancia en
 *   `errors`, el llamador decide cómo reaccionar (reintentar, alertar).
 */
export class ErpSyncService {
  constructor(
    private readonly erpClient: ErpMockClient,
    private readonly productsApi: ProductsApiLike
  ) {}

  async syncStock(): Promise<SyncReport> {
    const report: SyncReport = { timestamp: new Date().toISOString(), results: [], errors: [] };

    let items;
    try {
      ({ items } = await this.erpClient.getAllStock());
    } catch (err) {
      report.errors.push(`erp_unreachable: ${(err as Error).message}`);
      return report;
    }

    for (const item of items) {
      if (item.quantity < 0) {
        report.results.push({ sku: item.sku, action: 'skipped_invalid_data', detail: `negative quantity ${item.quantity}` });
        continue;
      }

      const exists = await this.productsApi.skuExists(item.sku).catch(() => false);
      if (!exists) {
        report.results.push({ sku: item.sku, action: 'skipped_unknown_sku' });
        continue;
      }

      try {
        await this.productsApi.updateStock(item.sku, item.quantity);
        report.results.push({ sku: item.sku, action: 'updated_stock' });
      } catch (err) {
        report.errors.push(`update_stock_failed:${item.sku}: ${(err as Error).message}`);
      }
    }

    return report;
  }

  async syncPrices(): Promise<SyncReport> {
    const report: SyncReport = { timestamp: new Date().toISOString(), results: [], errors: [] };

    let items;
    try {
      ({ items } = await this.erpClient.getAllPrices());
    } catch (err) {
      report.errors.push(`erp_unreachable: ${(err as Error).message}`);
      return report;
    }

    for (const item of items) {
      if (item.price < 0) {
        report.results.push({ sku: item.sku, action: 'skipped_invalid_data', detail: `negative price ${item.price}` });
        continue;
      }

      const exists = await this.productsApi.skuExists(item.sku).catch(() => false);
      if (!exists) {
        report.results.push({ sku: item.sku, action: 'skipped_unknown_sku' });
        continue;
      }

      try {
        await this.productsApi.updatePrice(item.sku, item.price);
        report.results.push({ sku: item.sku, action: 'updated_price' });
      } catch (err) {
        report.errors.push(`update_price_failed:${item.sku}: ${(err as Error).message}`);
      }
    }

    return report;
  }
}
