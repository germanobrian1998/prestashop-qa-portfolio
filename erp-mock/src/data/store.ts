// Seed alineado con framework/src/test-data/erp-skus.json.
// ⚠️ Valores de quantity/price son arbitrarios (placeholder) — el
// comentario original en erp-skus.json pide alinear contra products.json
// real antes de correr contra la instancia Docker completa. Para los
// tests de resiliencia (@erp, valores relativos vía +999 / +15) esto no
// importa: solo se comparan deltas, nunca valores absolutos fijos.

export interface StockRecord {
  sku: string;
  quantity: number;
  updatedAt: string;
}

export interface PriceRecord {
  sku: string;
  price: number;
  currency: string;
  updatedAt: string;
}

const SEED_SKUS = ['DEMO-TSHIRT-001', 'DEMO-MUG-002', 'DEMO-CAP-003', 'DEMO-POSTER-004'];

function now(): string {
  return new Date().toISOString();
}

function seedStock(): Map<string, StockRecord> {
  const map = new Map<string, StockRecord>();
  SEED_SKUS.forEach((sku, i) => {
    map.set(sku, { sku, quantity: 100 + i * 25, updatedAt: now() });
  });
  return map;
}

function seedPrices(): Map<string, PriceRecord> {
  const map = new Map<string, PriceRecord>();
  SEED_SKUS.forEach((sku, i) => {
    map.set(sku, { sku, price: 19.99 + i * 5, currency: 'ARS', updatedAt: now() });
  });
  return map;
}

export type ErpResource = 'stock' | 'prices' | 'orders';
export type ErpScenarioMode = 'normal' | 'stale' | 'timeout' | 'inconsistent';

export interface ScenarioConfig {
  mode: ErpScenarioMode;
  timeoutBehavior?: 'hang' | 'reset';
  timeoutMs?: number;
  targetSku?: string;
  // Snapshot congelado en el momento en que se activó modo 'stale'.
  staleStockSnapshot?: StockRecord[];
  stalePriceSnapshot?: PriceRecord[];
}

class ErpStore {
  stock = seedStock();
  prices = seedPrices();

  scenarios: Record<ErpResource, ScenarioConfig> = {
    stock: { mode: 'normal' },
    prices: { mode: 'normal' },
    orders: { mode: 'normal' },
  };

  applyScenario(
    resource: ErpResource | 'all',
    config: Omit<ScenarioConfig, 'staleStockSnapshot' | 'stalePriceSnapshot'>
  ): void {
    const resources: ErpResource[] = resource === 'all' ? ['stock', 'prices', 'orders'] : [resource];
    for (const r of resources) {
      const next: ScenarioConfig = { ...config };
      // Al activar 'stale', congelamos el estado ACTUAL como snapshot fijo.
      // Mutaciones posteriores a la "verdad" no deben moverlo.
      if (config.mode === 'stale') {
        if (r === 'stock') next.staleStockSnapshot = Array.from(this.stock.values()).map((v) => ({ ...v }));
        if (r === 'prices') next.stalePriceSnapshot = Array.from(this.prices.values()).map((v) => ({ ...v }));
      }
      this.scenarios[r] = next;
    }
  }

  resetScenarios(): void {
    this.scenarios = {
      stock: { mode: 'normal' },
      prices: { mode: 'normal' },
      orders: { mode: 'normal' },
    };
  }

  mutate(sku: string, changes: { quantity?: number; price?: number }): { stock?: StockRecord; price?: PriceRecord } {
    const result: { stock?: StockRecord; price?: PriceRecord } = {};
    if (changes.quantity !== undefined) {
      const rec: StockRecord = { sku, quantity: changes.quantity, updatedAt: now() };
      this.stock.set(sku, rec);
      result.stock = rec;
    }
    if (changes.price !== undefined) {
      const existing = this.prices.get(sku);
      const rec: PriceRecord = { sku, price: changes.price, currency: existing?.currency ?? 'ARS', updatedAt: now() };
      this.prices.set(sku, rec);
      result.price = rec;
    }
    return result;
  }
}

export const store = new ErpStore();
