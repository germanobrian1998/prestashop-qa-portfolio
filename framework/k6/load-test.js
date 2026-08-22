/// <reference types="k6" />
import http from 'k6/http';
import { check, sleep } from 'k6';

// -----------------------------------------------------------------------
// Sección 9 — Performance k6
// Fase actual: SMOKE mínimo, solo para validar que el job `performance`
// de qa.yml corre de punta a punta contra CI real (setup-k6-action +
// este script). No implementa todavía los escenarios LOAD/STRESS/SPIKE
// descriptos en 02-implementacion.md — eso queda para la siguiente
// iteración, una vez confirmado que esta base corre limpia en `main`.
//
// Referenciado por qa.yml como: framework/k6/load-test.js
// -----------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const WEBSERVICE_API_KEY = __ENV.WEBSERVICE_API_KEY;

// Thresholds conservadores a propósito: el objetivo de esta fase es
// "el job corre y mide", no todavía hacer cumplir los SLOs finales
// (p95 < 500ms catálogo, p99 < 1000ms creación de orden — ver Sección 9
// en 02-implementacion.md). Se ajustan cuando se implemente el diseño
// completo.
export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    http_req_failed: ['rate<0.01'],
  },
};

function authHeader() {
  if (!WEBSERVICE_API_KEY) return {};
  const token = encoding_b64(`${WEBSERVICE_API_KEY}:`);
  return { Authorization: `Basic ${token}` };
}

// k6 no trae Buffer de Node; base64 se resuelve con el encoding nativo de k6.
import encoding from 'k6/encoding';
function encoding_b64(str) {
  return encoding.b64encode(str);
}

export default function () {
  // 1) Front Office — home / listado de catálogo
  const homeRes = http.get(`${BASE_URL}/`);
  check(homeRes, {
    'home status 200': (r) => r.status === 200,
  });

  // 2) Webservice — GET /api/products (requiere WEBSERVICE_API_KEY)
  if (WEBSERVICE_API_KEY) {
    const productsRes = http.get(`${BASE_URL}/api/products?output_format=JSON`, {
      headers: authHeader(),
    });
    check(productsRes, {
      'webservice products status 200': (r) => r.status === 200,
    });
  }

  sleep(1);
}