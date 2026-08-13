// src/tests/webservice-security/permisos.steps.ts
//
// ⚠️ SUPUESTOS SIN CONFIRMAR (marcar y revisar):
// 1. Uso el fixture `request` nativo de Playwright (siempre disponible,
//    no depende de adivinar la API de WebserviceClient.ts, que no tengo).
//    Si preferís reusar WebserviceClient/ProductsApi/OrdersApi de
//    fixtures/index.ts, pasame esos archivos y lo adapto — evité hacerlo
//    a ciegas después de los dos supuestos que salieron mal con LoginPage
//    y playwright-bdd en la feature anterior.
// 2. El body XML del POST es un placeholder mínimo — no importa demasiado
//    su contenido exacto, porque el check de permisos en PrestaShop pasa
//    ANTES de parsear el payload (rechaza por key, no por datos inválidos).
//    Si el 401/403 no llega y en cambio hay un error de parseo XML, es
//    señal de que esa asunción está mal — avisame.
// 3. El regex de "no expone información sensible" es un check heurístico
//    de arranque (busca señales típicas de leak: stack traces, paths de
//    filesystem, mensajes de motor de BD). Ajustar con el body real de
//    la primera corrida si hace falta.
// 4. [RESUELTO] Mismo bug de aridad que ya salió en authentication.steps.ts:
//    cualquier step con {string}/{int} en el patrón Gherkin necesita ese
//    parámetro en la función, aunque no se use (ej: `_recurso: string`) —
//    si falta, playwright-bdd corre las fixtures y el capture group
//    desalineados y todo explota con errores confusos. Chequear esto
//    SIEMPRE antes de mandar cualquier step nuevo de acá en adelante.
// 5. [ESCENARIO IDOR] El descubrimiento de pedidos es en runtime (lista
//    todos los ids vía GET /api/orders y pide el detalle del primero que
//    responda 200), en vez de hardcodear id_order/id_customer fijos —
//    esos ids no son estables entre resets de la instancia (ya vimos hoy
//    mismo que id_carrier cambió de 2 a 5 solo por editar algo en el
//    Back Office). El primer pedido accesible ya es evidencia suficiente
//    del hallazgo: no hace falta iterar más ni armar dos clientes nuevos
//    a propósito, porque el problema es de TODOS los pedidos, no de uno.

import { createBdd } from 'playwright-bdd';
import { test, expect } from '../../fixtures/bdd';

const { Given, When, Then } = createBdd(test);

const API_KEY = process.env.WEBSERVICE_API_KEY ?? '';
const BASE_URL = process.env.BASE_URL ?? 'http://localhost';

if (!API_KEY) {
  throw new Error(
    'WEBSERVICE_API_KEY no definida en .env — confirmar que la key del ' +
    'Webservice sigue existiendo (ver checkeo hecho a mano en esta sesión).'
  );
}

// Key con permiso GET sobre "orders" (sin scope por cliente), generada en
// esta sesión vía Back Office → Parámetros Avanzados → Webservice, a
// propósito para reproducir el hallazgo de IDOR de forma acotada — NO
// tiene permiso sobre ningún otro recurso.
const API_KEY_ORDERS_READONLY = process.env.WEBSERVICE_API_KEY_ORDERS_READONLY ?? '';

if (!API_KEY_ORDERS_READONLY) {
  throw new Error(
    'WEBSERVICE_API_KEY_ORDERS_READONLY no definida en .env — confirmar que ' +
    'la key generada para el escenario de IDOR sigue existiendo.'
  );
}

const PLACEHOLDER_PRODUCT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <product>
    <name><language id="1"><![CDATA[QA Security Test Product]]></language></name>
  </product>
</prestashop>`;

function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`${API_KEY}:`).toString('base64')}`;
}

function basicAuthHeaderOrdersReadonly(): string {
  return `Basic ${Buffer.from(`${API_KEY_ORDERS_READONLY}:`).toString('base64')}`;
}

Given('una API key con permiso de solo lectura sobre {string}', async ({}, _recurso: string) => {
  // No-op declarativo: la key ya está configurada así en .env, verificado
  // a mano en esta sesión (products → 200, orders → 401).
});

Given('una API key sin ningún permiso sobre {string}', async ({}, _recurso: string) => {
  // Idem — misma key, sin permiso sobre 'orders'.
});

Given('una API key con permiso de lectura sobre "orders", sin scope por cliente', async () => {
  // No-op declarativo: la key ya está configurada así en .env, verificado
  // a mano en esta sesión (GET /api/orders/1 → 200 con datos de un cliente
  // ajeno a la key).
});

When('esa key intenta un POST contra el recurso {string}', async ({ request },recurso: string) => {
  const response = await request.post(`${BASE_URL}/api/${recurso}`, {
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'text/xml',
    },
    data: PLACEHOLDER_PRODUCT_XML,
  });
  process.env.__LAST_WS_STATUS = String(response.status());
  process.env.__LAST_WS_BODY = await response.text();
});

When('esa key intenta un GET contra el recurso {string}', async ({ request }, recurso: string) => {
  const response = await request.get(`${BASE_URL}/api/${recurso}`, {
    headers: { Authorization: basicAuthHeader() },
  });
  process.env.__LAST_WS_STATUS = String(response.status());
  process.env.__LAST_WS_BODY = await response.text();
});

When('esa key intenta un GET contra un pedido que no le pertenece', async ({ request }) => {
  // Descubrimiento en runtime, sin hardcodear ids: lista todos los pedidos
  // existentes y toma el primero accesible, para no depender de que un
  // id_order/id_customer específico sobreviva a un reset de datos.
  const listResponse = await request.get(`${BASE_URL}/api/orders?output_format=JSON`, {
    headers: { Authorization: basicAuthHeaderOrdersReadonly() },
  });
  expect(
    listResponse.status(),
    `No se pudo listar orders con la key de solo lectura. Status: ${listResponse.status()}`
  ).toBe(200);

  const listBody = await listResponse.json();
  const orderIds: number[] = (listBody.orders ?? []).map((o: { id: number }) => o.id);
  expect(
    orderIds.length,
    'No hay pedidos existentes en la instancia para probar el escenario.'
  ).toBeGreaterThan(0);

  let targetOrderId: number | null = null;
  let targetCustomerId: number | null = null;
  let targetBody: string | null = null;

  for (const id of orderIds) {
    const detailResponse = await request.get(`${BASE_URL}/api/orders/${id}?output_format=JSON`, {
      headers: { Authorization: basicAuthHeaderOrdersReadonly() },
    });
    const detailBody = await detailResponse.text();
    process.env.__LAST_WS_STATUS = String(detailResponse.status());
    process.env.__LAST_WS_BODY = detailBody;

    if (detailResponse.status() === 200) {
      const parsed = JSON.parse(detailBody);
      targetOrderId = id;
      targetCustomerId = parsed.order?.id_customer ?? null;
      targetBody = detailBody;
      break; // El primer pedido accesible ya es evidencia suficiente del IDOR.
    }
  }

  expect(
    targetOrderId,
    'Ningún pedido fue accesible — revisar si el hallazgo de IDOR sigue reproduciéndose.'
  ).not.toBeNull();

  process.env.__LAST_IDOR_ORDER_ID = String(targetOrderId);
  process.env.__LAST_IDOR_CUSTOMER_ID = String(targetCustomerId);
  process.env.__LAST_WS_BODY = targetBody ?? '';
});

Then('el sistema rechaza la operación con un status de error apropiado', async() => {
  const status = process.env.__LAST_WS_STATUS ?? '';
  // FIX confirmado con evidencia real: para un método no permitido con la
  // key actual, PrestaShop devuelve 405 (Method Not Allowed) con mensaje
  // explícito ("Method POST is not allowed for the resource products with
  // this authentication key") en vez de un 401/403 genérico — es MÁS preciso
  // semánticamente (RESTful correcto), no un bug. Para falta total de
  // permiso sobre un recurso (ver escenario de 'orders'), sigue siendo 401.
  const validRejectionStatuses = ['401', '403', '405'];
  expect(
    validRejectionStatuses.includes(status),
    `Status recibido: ${status} (esperaba uno de ${validRejectionStatuses.join('/')}). Body: ${process.env.__LAST_WS_BODY}`
  ).toBeTruthy();
});

Then('no expone información sensible en el error', async () => {
  const body = (process.env.__LAST_WS_BODY ?? '').toLowerCase();
  // Heurística de arranque — no exhaustiva. Señales típicas de leak:
  // stack traces de PHP, paths absolutos de filesystem, o mensajes de MySQL.
  const leakPatterns = /stack trace|fatal error|warning:.*on line|\/var\/www|mysql_|sql syntax/;
  expect(
    !leakPatterns.test(body),
    `El body del error parece filtrar información interna: ${process.env.__LAST_WS_BODY}`
  ).toBeTruthy();
});

Then('el sistema NO rechaza la operación y expone el pedido ajeno completo', async () => {
  const status = process.env.__LAST_WS_STATUS ?? '';
  const body = process.env.__LAST_WS_BODY ?? '';
  const orderId = process.env.__LAST_IDOR_ORDER_ID ?? '';
  const customerId = process.env.__LAST_IDOR_CUSTOMER_ID ?? '';

  expect(
    status,
    `Se esperaba 200 (comportamiento real observado = hallazgo). Status: ${status}. Body: ${body}`
  ).toBe('200');

  expect(
    body.includes('"id_address_delivery"') && body.includes('"total_paid"'),
    `El body no contiene los campos esperados de un pedido completo. Body: ${body}`
  ).toBeTruthy();

  console.log(
    `[IDOR confirmado] Pedido id=${orderId} (cliente id=${customerId}) accedido con ` +
    `una key sin ningún vínculo declarado con ese cliente.`
  );
});
