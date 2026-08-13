// src/tests/webservice-security/inyeccion-sql.steps.ts
//
// ⚠️ SUPUESTOS SIN CONFIRMAR (marcar y revisar):
// 1. La sintaxis de filtro del Webservice de PrestaShop es
//    `?filter[campo]=valor` — confirmado contra la documentación del
//    framework (Sección 5, "API helpers para precondiciones vía Webservice"),
//    pero no verificado todavía contra una request real con este payload.
// 2. El payload es un clásico ' OR '1'='1 — suficiente para exponer un
//    problema si las queries no están parametrizadas. No cubre todas las
//    variantes posibles de SQLi (blind, time-based, etc.) — esto es un
//    smoke check, no una auditoría de seguridad exhaustiva.
// 3. No asumo qué status HTTP "debería" devolver un payload así — a
//    diferencia del escenario de permisos, acá no hay un status esperado
//    obvio de antemano (podría ser 200 con resultado vacío/normal si el
//    ORM sanitiza bien, o un error controlado). El check real es que el
//    BODY no filtre información interna, sea cual sea el status.
// 4. Recordatorio del bug de aridad que ya salió dos veces: cualquier
//    step con {string} en el patrón necesita ese parámetro en la función.

import { createBdd } from 'playwright-bdd';
import { test, expect } from '../../fixtures/bdd';

const { Given, When, Then } = createBdd(test);

const API_KEY = process.env.WEBSERVICE_API_KEY ?? '';
const BASE_URL = process.env.BASE_URL ?? 'http://localhost';

if (!API_KEY) {
  throw new Error('WEBSERVICE_API_KEY no definida en .env.');
}

const SQLI_PAYLOAD = `' OR '1'='1`;

function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`${API_KEY}:`).toString('base64')}`;
}

Given('una API key con permiso de lectura sobre {string}', async ({}, _recurso: string) => {
  // No-op declarativo: la key ya tiene permiso GET sobre 'products',
  // verificado a mano en esta sesión.
});

When('esa key hace un GET con un payload de inyección SQL en el filtro {string}', async ({ request }, campo: string) => {
  const url = `${BASE_URL}/api/products?filter[${campo}]=${encodeURIComponent(SQLI_PAYLOAD)}`;
  const response = await request.get(url, {
    headers: { Authorization: basicAuthHeader() },
  });
  process.env.__LAST_SQLI_STATUS = String(response.status());
  process.env.__LAST_SQLI_BODY = await response.text();
});

Then('el sistema responde de forma controlada, sin exponer detalles internos', async () => {
  const status = process.env.__LAST_SQLI_STATUS ?? '';
  const body = (process.env.__LAST_SQLI_BODY ?? '').toLowerCase();
  // Señales típicas de que el error de BD se filtró tal cual al cliente:
  // mensaje crudo de MySQL, sintaxis SQL expuesta, stack trace de PHP,
  // o paths absolutos del filesystem del servidor.
  const leakPatterns = /sql syntax|mysqli|you have an error in your sql|fatal error|stack trace|warning:.*on line|\/var\/www/;
  expect(
    !leakPatterns.test(body),
    `Posible leak de información interna. Status: ${status}. Body: ${process.env.__LAST_SQLI_BODY}`
  ).toBeTruthy();
});
