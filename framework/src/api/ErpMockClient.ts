// Cliente TS para el ERP Mock (Sección 5.2).
// Mismo criterio de Single Responsibility que WebserviceClient.ts (Sección 5):
// esta clase solo sabe hablar HTTP con el mock, no conoce PrestaShop ni
// Playwright. ErpSyncService.ts es quien la combina con ProductsApi.

export interface ErpStockRecord {
  sku: string;
  quantity: number;
  updatedAt: string;
}

export interface ErpPriceRecord {
  sku: string;
  price: number;
  currency: string;
  updatedAt: string;
}

export interface ErpOrderConfirmation {
  confirmed: boolean;
  erpOrderId: string;
  orderReference: string;
  confirmedAt: string;
  issues?: string[];
}

export type ErpResource = 'stock' | 'prices' | 'orders' | 'all';
export type ErpScenarioMode = 'normal' | 'stale' | 'timeout' | 'inconsistent';

export interface ErpScenarioRequest {
  resource: ErpResource;
  mode: ErpScenarioMode;
  timeoutBehavior?: 'hang' | 'reset';
  timeoutMs?: number;
  targetSku?: string;
}

export interface ErpMockClientOptions {
  baseUrl: string;
  controlToken: string;
  // Timeout del lado del cliente -- clave para el escenario "timeout":
  // sin esto, un mock en modo "hang" cuelga el request indefinidamente
  // del lado del test tambien.
  requestTimeoutMs?: number;
}

export class ErpMockClient {
  private readonly baseUrl: string;
  private readonly controlToken: string;
  private readonly requestTimeoutMs: number;

  constructor(options: ErpMockClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.controlToken = options.controlToken;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5000;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    { control = false }: { control?: boolean } = {}
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(control ? { 'x-erp-control-token': this.controlToken } : {}),
          ...(init.headers ?? {}),
        },
      });

      const body = await response.json().catch(() => undefined);

      if (!response.ok && response.status !== 409) {
        throw new Error(
          `ErpMockClient: ${init.method ?? 'GET'} ${path} -> ${response.status} ${JSON.stringify(body)}`
        );
      }

      return body as T;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- datos ----
  getAllStock(): Promise<{ source: string; items: ErpStockRecord[] }> {
    return this.request('/erp/stock');
  }

  getStock(sku: string): Promise<{ source: string; item: ErpStockRecord }> {
    return this.request(`/erp/stock/${encodeURIComponent(sku)}`);
  }

  getAllPrices(): Promise<{ source: string; items: ErpPriceRecord[] }> {
    return this.request('/erp/prices');
  }

  getPrice(sku: string): Promise<{ source: string; item: ErpPriceRecord }> {
    return this.request(`/erp/prices/${encodeURIComponent(sku)}`);
  }

  confirmOrder(
    orderReference: string,
    lines: Array<{ sku: string; quantity: number }>
  ): Promise<ErpOrderConfirmation> {
    return this.request('/erp/orders/confirm', {
      method: 'POST',
      body: JSON.stringify({ orderReference, lines }),
    });
  }

  // ---- control (usado desde los tests para armar el escenario) ----
  setScenario(req: ErpScenarioRequest): Promise<{ ok: boolean }> {
    return this.request(
      '/erp/_control/scenario',
      { method: 'POST', body: JSON.stringify(req) },
      { control: true }
    );
  }

  mutate(sku: string, changes: { quantity?: number; price?: number }): Promise<unknown> {
    return this.request(
      '/erp/_control/mutate',
      { method: 'POST', body: JSON.stringify({ sku, ...changes }) },
      { control: true }
    );
  }

  resetScenarios(): Promise<{ ok: boolean }> {
    return this.request('/erp/_control/reset', { method: 'POST' }, { control: true });
  }

  getControlState(): Promise<unknown> {
    return this.request('/erp/_control/state', {}, { control: true });
  }
}
