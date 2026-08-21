import express, { NextFunction, Request, Response } from 'express';
import { store, ErpResource, ErpScenarioMode } from './data/store';

const PORT = Number(process.env.ERP_MOCK_PORT ?? 4000);
const CONTROL_TOKEN = process.env.ERP_MOCK_CONTROL_TOKEN ?? 'local-only-token';

// Delay por defecto para el modo 'hang': suficientemente largo para que el
// AbortController del lado del cliente dispare primero (requestTimeoutMs
// en los tests es 3000-5000ms), pero acotado para no dejar sockets
// colgando indefinidamente en una corrida de CI larga.
const DEFAULT_HANG_MS = 15000;

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

// ---- middleware de control: exige x-erp-control-token ----
function requireControlToken(req: Request, res: Response, next: NextFunction) {
  const token = req.header('x-erp-control-token');
  if (token !== CONTROL_TOKEN) {
    return res.status(401).json({ error: 'invalid or missing control token' });
  }
  next();
}

// ---- helper: aplica timeout ('hang' | 'reset') si el escenario lo pide ----
// Devuelve true si ya se manejó la respuesta (el caller no debe responder de nuevo).
function handleTimeoutIfNeeded(resource: ErpResource, req: Request, res: Response): boolean {
  const scenario = store.scenarios[resource];
  if (scenario.mode !== 'timeout') return false;

  if (scenario.timeoutBehavior === 'reset') {
    // Simula ECONNRESET: destruye el socket sin responder nada.
    // IMPORTANTE: sin un listener de 'error', un ECONNRESET async en este
    // socket puede escalar a excepción no capturada y tirar abajo TODO el
    // proceso (no solo esta conexión) — se vio en pruebas locales.
    req.socket.on('error', () => {
      /* no-op: esperado al forzar el reset, no debe crashear el server */
    });
    req.socket.destroy();
    return true;
  }

  // 'hang' (default si no se especifica): no responder hasta el delay,
  // el cliente debería abortar antes por su propio requestTimeoutMs.
  const delay = scenario.timeoutMs ?? DEFAULT_HANG_MS;
  setTimeout(() => {
    if (!res.writableEnded) res.status(503).json({ error: 'erp mock: simulated late response' });
  }, delay);
  return true;
}

// ==================== STOCK ====================

app.get('/erp/stock', (req, res) => {
  if (handleTimeoutIfNeeded('stock', req, res)) return;

  const scenario = store.scenarios.stock;

  if (scenario.mode === 'stale' && scenario.staleStockSnapshot) {
    return res.json({ source: 'stale-snapshot', items: scenario.staleStockSnapshot });
  }

  const items = Array.from(store.stock.values()).map((rec) => {
    if (scenario.mode === 'inconsistent' && scenario.targetSku === rec.sku) {
      return { ...rec, quantity: -1 };
    }
    return rec;
  });
  return res.json({ source: 'live', items });
});

app.get('/erp/stock/:sku', (req, res) => {
  if (handleTimeoutIfNeeded('stock', req, res)) return;

  const scenario = store.scenarios.stock;
  const sku = req.params.sku;

  if (scenario.mode === 'stale' && scenario.staleStockSnapshot) {
    const item = scenario.staleStockSnapshot.find((r) => r.sku === sku);
    if (!item) return res.status(404).json({ error: 'sku not found in snapshot' });
    return res.json({ source: 'stale-snapshot', item });
  }

  const rec = store.stock.get(sku);
  if (!rec) return res.status(404).json({ error: 'sku not found' });

  const item = scenario.mode === 'inconsistent' && scenario.targetSku === sku ? { ...rec, quantity: -1 } : rec;
  return res.json({ source: 'live', item });
});

// ==================== PRICES ====================

app.get('/erp/prices', (req, res) => {
  if (handleTimeoutIfNeeded('prices', req, res)) return;

  const scenario = store.scenarios.prices;

  if (scenario.mode === 'stale' && scenario.stalePriceSnapshot) {
    return res.json({ source: 'stale-snapshot', items: scenario.stalePriceSnapshot });
  }

  const items = Array.from(store.prices.values()).map((rec) => {
    if (scenario.mode === 'inconsistent' && scenario.targetSku === rec.sku) {
      return { ...rec, price: -1 };
    }
    return rec;
  });
  return res.json({ source: 'live', items });
});

app.get('/erp/prices/:sku', (req, res) => {
  if (handleTimeoutIfNeeded('prices', req, res)) return;

  const scenario = store.scenarios.prices;
  const sku = req.params.sku;

  if (scenario.mode === 'stale' && scenario.stalePriceSnapshot) {
    const item = scenario.stalePriceSnapshot.find((r) => r.sku === sku);
    if (!item) return res.status(404).json({ error: 'sku not found in snapshot' });
    return res.json({ source: 'stale-snapshot', item });
  }

  const rec = store.prices.get(sku);
  if (!rec) return res.status(404).json({ error: 'sku not found' });

  const item = scenario.mode === 'inconsistent' && scenario.targetSku === sku ? { ...rec, price: -1 } : rec;
  return res.json({ source: 'live', item });
});

// ==================== ORDERS ====================

app.post('/erp/orders/confirm', (req, res) => {
  if (handleTimeoutIfNeeded('orders', req, res)) return;

  const { orderReference, lines } = req.body ?? {};
  if (!orderReference || !Array.isArray(lines)) {
    return res.status(400).json({ error: 'orderReference and lines are required' });
  }

  return res.json({
    confirmed: true,
    erpOrderId: `ERP-${Date.now()}`,
    orderReference,
    confirmedAt: new Date().toISOString(),
  });
});

// ==================== CONTROL ====================

app.post('/erp/_control/scenario', requireControlToken, (req, res) => {
  const { resource, mode, timeoutBehavior, timeoutMs, targetSku } = req.body ?? {};

  const validResources: Array<ErpResource | 'all'> = ['stock', 'prices', 'orders', 'all'];
  const validModes: ErpScenarioMode[] = ['normal', 'stale', 'timeout', 'inconsistent'];

  if (!validResources.includes(resource) || !validModes.includes(mode)) {
    return res.status(400).json({ error: 'invalid resource or mode' });
  }

  store.applyScenario(resource, { mode, timeoutBehavior, timeoutMs, targetSku });
  return res.json({ ok: true });
});

app.post('/erp/_control/mutate', requireControlToken, (req, res) => {
  const { sku, quantity, price } = req.body ?? {};
  if (!sku) return res.status(400).json({ error: 'sku is required' });

  const updated = store.mutate(sku, { quantity, price });
  return res.json({ ok: true, updated });
});

app.post('/erp/_control/reset', requireControlToken, (_req, res) => {
  store.resetScenarios();
  return res.json({ ok: true });
});

app.get('/erp/_control/state', requireControlToken, (_req, res) => {
  return res.json({
    scenarios: store.scenarios,
    stock: Array.from(store.stock.values()),
    prices: Array.from(store.prices.values()),
  });
});

app.listen(PORT, () => {
  console.log(`[erp-mock] listening on :${PORT}`);
});
