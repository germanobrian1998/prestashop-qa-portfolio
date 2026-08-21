/**
 * ci-seed.ts
 * -----------------------------------------------------------------------
 * Recrea, contra una instancia recién instalada (PS_INSTALL_AUTO=1) o
 * contra una instancia local a la que se le reinició/perdió estado, los
 * datos que el GAP CRÍTICO (00-estado-proyecto-v4.md) documenta como
 * perdidos, más un gap adicional descubierto esta sesión:
 *
 *   0. Webservice completo (feature + cuentas + shop + permisos)
 *   1. Cliente de test
 *   2. Zona South America en el carrier existente
 *   3. WEBSERVICE_WEBHOOK_SECRET
 *
 * REESCRITO 2026-08-15 contra la interfaz REAL de WebserviceClient.ts y
 * DbClient.ts (confirmada leyendo el código fuente, no asumida). Cambios
 * de diseño respecto a la primera versión:
 *
 *   - WebserviceClient/DbClient tienen constructor PRIVADO — se
 *     instancian con `await WebserviceClient.create(...)` /
 *     `await DbClient.create(...)`, nunca con `new`.
 *   - `WebserviceClient.post()` espera XML crudo (string), no un objeto
 *     JS — PrestaShop Webservice requiere XML para escritura.
 *   - `DbClient.query()` no expone `insertId` de forma tipada (el
 *     wrapper tipa el resultado como `T[]` siempre). En vez de depender
 *     de eso, cada INSERT va seguido de un SELECT explícito para
 *     recuperar el id — más verboso pero no depende de un detalle de
 *     implementación de mysql2 que el wrapper no expone con seguridad
 *     de tipos.
 *
 * GAP DE DISEÑO DESCUBIERTO Y RESUELTO ESTA SESIÓN: ninguna de las 2 API
 * keys de seguridad (`WEBSERVICE_API_KEY` → products:GET,
 * `WEBSERVICE_API_KEY_ORDERS_READONLY` → orders:GET) tiene permiso sobre
 * el recurso `customers` — a propósito, para no invalidar
 * permisos.feature (Sección 6, IDOR). El cliente de test NUNCA se pudo
 * haber creado por Webservice con esas keys; siempre fue a mano en Back
 * Office (confirma la nota "no existe seed script" de v4). Se agrega acá
 * una TERCERA cuenta de Webservice, dedicada exclusivamente a seeding
 * (`customers:POST` + `customers:GET`), que ningún test de seguridad usa
 * ni referencia — no afecta el escenario de IDOR ni el de permisos
 * limitados.
 *
 * GAP DEL WEBSERVICE (feature + cuentas + shop + permisos vacíos, no
 * documentado en v4 hasta ahora): confirmado contra la instancia real
 * que un simple restart de containers (no necesariamente reinstalación
 * completa) puede dejar `ps_webservice_account`,
 * `ps_webservice_account_shop` y `ps_webservice_permission` vacías, y
 * `PS_WEBSERVICE` ausente de `ps_configuration` (→ 503 en cualquier
 * `/api/*`). ensureWebserviceReady() reconstruye las 4 piezas.
 *
 * Uso:
 *   npx ts-node scripts/ci-seed.ts
 *
 * Requiere en el entorno (framework/.env, cargado acá con dotenv porque
 * este script corre standalone, fuera del proceso de Playwright):
 *   BASE_URL, WEBSERVICE_API_KEY, WEBSERVICE_API_KEY_ORDERS_READONLY,
 *   WEBSERVICE_SEED_API_KEY (nueva — ver default más abajo si no está
 *   seteada), DATABASE_URL, TEST_CUSTOMER_EMAIL, TEST_CUSTOMER_PASSWORD
 *
 * Output:
 *   - Actualiza/crea framework/.env con TEST_CUSTOMER_ID,
 *     CARRIER_SOUTH_AMERICA_ID y WEBSERVICE_WEBHOOK_SECRET.
 *   - Si GITHUB_OUTPUT está seteado, también escribe ahí los mismos
 *     valores para pasarlos a jobs downstream sin repetir el seed.
 *
 * SUPUESTO SIN CONFIRMAR RESTANTE:
 *
 *   [D] `TARGET_CARRIER_ID_REFERENCE = 2` se confirmó como correcto
 *       contra la instancia actual (2026-08-15), pero no hay garantía de
 *       que sea el mismo `id_reference` en una instancia reinstalada
 *       100% desde cero. La primera corrida en un entorno de CI limpio
 *       debe validar este valor con:
 *         SELECT id_carrier, id_reference, name FROM ps_carrier
 *         WHERE deleted = 0 ORDER BY id_carrier;
 *       y ajustar la constante (vía TARGET_CARRIER_ID_REFERENCE en env)
 *       si no coincide.
 * -----------------------------------------------------------------------
 */

import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { WebserviceClient } from '../src/api/WebserviceClient';
import { DbClient } from '../src/db/DbClient';

// ── Config desde entorno ────────────────────────────────────────────────
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[ci-seed] Falta variable de entorno requerida: ${name}`);
  }
  return value;
}

const BASE_URL = process.env.BASE_URL ?? 'http://localhost';
const DATABASE_URL = requireEnv('DATABASE_URL');
const API_KEY = requireEnv('WEBSERVICE_API_KEY');
const API_KEY_ORDERS_READONLY = requireEnv('WEBSERVICE_API_KEY_ORDERS_READONLY');

// Nueva: cuenta dedicada SOLO a seeding, nunca referenciada por ningún
// test de seguridad. Si no está en .env, usa este default — pero
// conviene fijarla explícitamente en .env para que sea estable entre
// corridas (evita recrear la cuenta con una key distinta cada vez que
// no se pasa la variable).
const SEED_API_KEY =
  process.env.WEBSERVICE_SEED_API_KEY ?? 'QASEEDINGONLYNOTFORSECURITYTESTS';

const TEST_CUSTOMER_EMAIL =
  process.env.TEST_CUSTOMER_EMAIL ?? 'qa.customer@prestashop-qa.local';
const TEST_CUSTOMER_PASSWORD =
  process.env.TEST_CUSTOMER_PASSWORD ?? 'QaTest2026!';

const WEBHOOK_SECRET_CONFIG_KEY =
  process.env.WEBHOOK_SECRET_CONFIG_KEY ?? 'DUMMYPAYMENT_WEBHOOK_SECRET';

const TARGET_CARRIER_ID_REFERENCE = Number(
  process.env.TARGET_CARRIER_ID_REFERENCE ?? 2,
);
const SOUTH_AMERICA_ZONE_ID = 6; // ps_zone.name = 'South America', confirmado
const SOUTH_AMERICA_PRICE = '5.000000';

const DEFAULT_SHOP_ID = Number(process.env.DEFAULT_SHOP_ID ?? 1);

// Scope EXACTO por cuenta — no agregar permisos sin revisar
// framework/src/tests/webservice-security/permisos.feature primero. Las
// primeras 2 son las keys de seguridad (intocables); la tercera es
// exclusiva de este script.
const WEBSERVICE_ACCOUNTS: Array<{
  key: string;
  description: string;
  permissions: Array<{ resource: string; method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' }>;
}> = [
  {
    key: API_KEY,
    description: 'QA framework - general (read-only products)',
    permissions: [{ resource: 'products', method: 'GET' }],
  },
  {
    key: API_KEY_ORDERS_READONLY,
    description: 'QA framework - orders readonly (IDOR scenario, Seccion 6.2/11)',
    permissions: [{ resource: 'orders', method: 'GET' }],
  },
  {
    key: SEED_API_KEY,
    description: 'QA framework - seed-only (customers create, ci-seed.ts). NO usar en tests de seguridad.',
    permissions: [
      { resource: 'customers', method: 'POST' },
      { resource: 'customers', method: 'GET' },
    ],
  },
];

// ── Helpers XML (PrestaShop Webservice requiere XML para escritura) ────
function xmlEscape(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function buildCustomerXml(params: {
  firstname: string;
  lastname: string;
  email: string;
  passwd: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <customer>
    <passwd><![CDATA[${xmlEscape(params.passwd)}]]></passwd>
    <lastname><![CDATA[${xmlEscape(params.lastname)}]]></lastname>
    <firstname><![CDATA[${xmlEscape(params.firstname)}]]></firstname>
    <email><![CDATA[${xmlEscape(params.email)}]]></email>
    <id_default_group>3</id_default_group>
    <id_lang>1</id_lang>
    <newsletter>0</newsletter>
    <optin>0</optin>
    <active>1</active>
  </customer>
</prestashop>`;
}

// ── 0. Webservice completo (feature + cuentas + shop + permisos) ───────
async function ensureWebserviceReady(db: DbClient): Promise<void> {
  const wsConfig = await db.queryOne<{ value: string }>(
    "SELECT value FROM ps_configuration WHERE name = 'PS_WEBSERVICE'",
  );

  if (!wsConfig) {
    await db.query(
      "INSERT INTO ps_configuration (name, value, date_add, date_upd) VALUES ('PS_WEBSERVICE', '1', NOW(), NOW())",
    );
    console.log('[ci-seed] PS_WEBSERVICE activado (estaba ausente -> 503 en /api/*).');
  } else if (wsConfig.value !== '1') {
    await db.query(
      "UPDATE ps_configuration SET value = '1', date_upd = NOW() WHERE name = 'PS_WEBSERVICE'",
    );
    console.log('[ci-seed] PS_WEBSERVICE reactivado (estaba en 0).');
  } else {
    console.log('[ci-seed] PS_WEBSERVICE ya estaba activo.');
  }

  for (const account of WEBSERVICE_ACCOUNTS) {
    const existing = await db.queryOne<{ id_webservice_account: number }>(
      'SELECT id_webservice_account FROM ps_webservice_account WHERE `key` = ?',
      [account.key],
    );

    if (existing) {
      console.log(
        `[ci-seed] Cuenta Webservice ya existe para key ...${account.key.slice(-4)} ` +
        `(id=${existing.id_webservice_account}).`,
      );
      continue;
    }

    await db.query(
      'INSERT INTO ps_webservice_account (`key`, description, class_name, is_module, active) VALUES (?, ?, ?, 0, 1)',
      [account.key, account.description, 'WebserviceRequest'],
    );

    // No confiar en insertId del wrapper (ver nota de cabecera) — volver
    // a buscar el id recién insertado por su key, que es única.
    const created = await db.queryOne<{ id_webservice_account: number }>(
      'SELECT id_webservice_account FROM ps_webservice_account WHERE `key` = ?',
      [account.key],
    );

    if (!created) {
      throw new Error(
        `[ci-seed] La cuenta Webservice para key ...${account.key.slice(-4)} no se ` +
        'encontró inmediatamente después de insertarla. Revisar manualmente.',
      );
    }

    const accountId = created.id_webservice_account;

    await db.query(
      'INSERT INTO ps_webservice_account_shop (id_webservice_account, id_shop) VALUES (?, ?)',
      [accountId, DEFAULT_SHOP_ID],
    );

    for (const perm of account.permissions) {
      await db.query(
        'INSERT INTO ps_webservice_permission (resource, method, id_webservice_account) VALUES (?, ?, ?)',
        [perm.resource, perm.method, accountId],
      );
    }

    console.log(
      `[ci-seed] Cuenta Webservice creada para key ...${account.key.slice(-4)} (id=${accountId}), ` +
      `permisos: ${account.permissions.map((p) => `${p.resource}:${p.method}`).join(', ')}.`,
    );
  }
}

// ── 1. Cliente de test (vía la cuenta de seeding, no las de seguridad) ─
async function seedTestCustomer(): Promise<number> {
  const ws = await WebserviceClient.create(SEED_API_KEY, `${BASE_URL}/api/`);

  try {
    const existing = await ws.get('customers', {
      // Sintaxis confirmada contra la instancia real (2026-08-17): el
      // corchete va en el NOMBRE del parámetro (filter[email]), no
      // concatenado dentro del valor. La forma `{ filter: '[email]=...' }`
      // (tomada de un comentario de ejemplo en WebserviceClient.ts) es
      // incorrecta y provoca un error interno de PHP en el Webservice.
      params: { 'filter[email]': TEST_CUSTOMER_EMAIL },
    });

    const existingList = (existing.body as { customers?: Array<{ id: string }> })?.customers;
    if (existingList?.length) {
      const id = Number(existingList[0].id);
      console.log(`[ci-seed] Cliente de test ya existe (id=${id}), no se recrea.`);
      return id;
    }

    const xml = buildCustomerXml({
      firstname: 'QA',
      lastname: 'Customer',
      email: TEST_CUSTOMER_EMAIL,
      passwd: TEST_CUSTOMER_PASSWORD,
    });

    const created = await ws.post('customers', xml);

    if (created.status < 200 || created.status >= 300) {
      throw new Error(
        `[ci-seed] POST /api/customers falló con status ${created.status}. ` +
        `Body: ${JSON.stringify(created.body)}`,
      );
    }

    const createdBody = created.body as { customer?: { id: string } };
    if (!createdBody?.customer?.id) {
      throw new Error(
        `[ci-seed] Respuesta de POST /api/customers no tiene la forma esperada. ` +
        `Body: ${JSON.stringify(created.body)}`,
      );
    }

    const id = Number(createdBody.customer.id);
    console.log(`[ci-seed] Cliente de test creado (id=${id}).`);
    return id;
  } finally {
    await ws.dispose();
  }
}

// ── 2. Zona South America en el carrier existente ──────────────────────
async function ensureSouthAmericaShippingZone(
  db: DbClient,
): Promise<{ carrierId: number; alreadyPresent: boolean }> {
  const carrier = await db.queryOne<{ id_carrier: number }>(
    `SELECT id_carrier FROM ps_carrier
     WHERE id_reference = ? AND deleted = 0
     ORDER BY id_carrier DESC LIMIT 1`,
    [TARGET_CARRIER_ID_REFERENCE],
  );

  if (!carrier) {
    throw new Error(
      `[ci-seed] No se encontró carrier activo con id_reference=` +
      `${TARGET_CARRIER_ID_REFERENCE}. Ver supuesto [D] en la cabecera: ` +
      'este valor puede no coincidir en una instancia reinstalada 100% ' +
      'desde cero. Confirmar con: SELECT id_carrier, id_reference, name ' +
      'FROM ps_carrier WHERE deleted = 0 ORDER BY id_carrier; y ajustar ' +
      'TARGET_CARRIER_ID_REFERENCE (env var) si hace falta.',
    );
  }

  const carrierId = carrier.id_carrier;

  const zone = await db.queryOne(
    'SELECT 1 AS present FROM ps_carrier_zone WHERE id_carrier = ? AND id_zone = ?',
    [carrierId, SOUTH_AMERICA_ZONE_ID],
  );

  if (zone) {
    console.log(
      `[ci-seed] Carrier ${carrierId} (id_reference=${TARGET_CARRIER_ID_REFERENCE}) ` +
      'ya tiene la zona South America asociada, no se modifica.',
    );
    return { carrierId, alreadyPresent: true };
  }

  await db.query(
    'INSERT INTO ps_carrier_zone (id_carrier, id_zone) VALUES (?, ?)',
    [carrierId, SOUTH_AMERICA_ZONE_ID],
  );

  const rangeRef = await db.queryOne<{ id_range_weight: number | null }>(
    'SELECT id_range_weight FROM ps_delivery WHERE id_carrier = ? LIMIT 1',
    [carrierId],
  );
  const rangeWeight = rangeRef?.id_range_weight ?? null;

  if (rangeWeight === null) {
    console.warn(
      `[ci-seed] ADVERTENCIA: el carrier ${carrierId} no tenía ninguna fila ` +
      'previa en ps_delivery para tomar id_range_weight de referencia. ' +
      'Insertando con NULL — revisar manualmente si el checkout con este ' +
      'carrier falla por rango de peso indefinido.',
    );
  }

  await db.query(
    `INSERT INTO ps_delivery
       (id_shop, id_shop_group, id_carrier, id_range_price, id_range_weight, id_zone, price)
     VALUES (NULL, NULL, ?, NULL, ?, ?, ?)`,
    [carrierId, rangeWeight, SOUTH_AMERICA_ZONE_ID, SOUTH_AMERICA_PRICE],
  );

  console.log(
    `[ci-seed] Zona South America agregada al carrier ${carrierId} a $${SOUTH_AMERICA_PRICE}.`,
  );

  return { carrierId, alreadyPresent: false };
}

// ── 3. Webhook secret ───────────────────────────────────────────────────
async function readWebhookSecret(db: DbClient): Promise<string> {
  const row = await db.queryOne<{ value: string }>(
    'SELECT value FROM ps_configuration WHERE name = ? ORDER BY id_configuration DESC LIMIT 1',
    [WEBHOOK_SECRET_CONFIG_KEY],
  );

  if (!row) {
    throw new Error(
      `[ci-seed] No se encontró ps_configuration.name = '${WEBHOOK_SECRET_CONFIG_KEY}'. ` +
      'Confirmar manualmente con: SELECT name FROM ps_configuration WHERE ' +
      "name LIKE '%WEBHOOK%'; y ajustar WEBHOOK_SECRET_CONFIG_KEY (env var) si hace falta.",
    );
  }

  return row.value;
}

// ── Verificación final (mismo check que se hizo a mano con curl) ───────
async function verifyWebserviceScopes(): Promise<void> {
  const general = await WebserviceClient.create(API_KEY, `${BASE_URL}/api/`);
  const ordersReadonly = await WebserviceClient.create(API_KEY_ORDERS_READONLY, `${BASE_URL}/api/`);

  try {
    const productsRes = await general.get('products');
    const ordersGeneralRes = await general.get('orders');
    const ordersReadonlyRes = await ordersReadonly.get('orders');

    const checks: Array<[string, number, number]> = [
      ['products GET (key general)', productsRes.status, 200],
      ['orders GET (key general)', ordersGeneralRes.status, 401],
      ['orders GET (key IDOR readonly)', ordersReadonlyRes.status, 200],
    ];

    for (const [label, actual, expected] of checks) {
      if (actual !== expected) {
        throw new Error(
          `[ci-seed] Verificación de scope falló: "${label}" devolvió ${actual}, ` +
          `se esperaba ${expected}. El seed de permisos puede estar mal.`,
        );
      }
      console.log(`[ci-seed] Verificado: ${label} -> ${actual} (OK).`);
    }
  } finally {
    await general.dispose();
    await ordersReadonly.dispose();
  }
}

// ── Output ───────────────────────────────────────────────────────────────
function writeOutputs(values: Record<string, string>) {
  const envPath = path.resolve(__dirname, '..', '.env');
  const existingEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
  const lines = existingEnv.split('\n').filter((line) => {
    const key = line.split('=')[0];
    return key && !(key in values);
  });
  for (const [key, value] of Object.entries(values)) {
    lines.push(`${key}=${value}`);
  }
  fs.writeFileSync(envPath, lines.filter(Boolean).join('\n') + '\n');
  console.log(`[ci-seed] .env actualizado en ${envPath}`);

  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    const outLines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
    fs.appendFileSync(githubOutput, outLines.join('\n') + '\n');
    console.log('[ci-seed] Valores expuestos como job outputs (GITHUB_OUTPUT).');
  }
}

async function main() {
  const db = await DbClient.create(DATABASE_URL);

  try {
    await ensureWebserviceReady(db);
    const customerId = await seedTestCustomer();
    const { carrierId } = await ensureSouthAmericaShippingZone(db);
    const webhookSecret = await readWebhookSecret(db);
    await verifyWebserviceScopes();

    writeOutputs({
      TEST_CUSTOMER_ID: String(customerId),
      CARRIER_SOUTH_AMERICA_ID: String(carrierId),
      WEBSERVICE_WEBHOOK_SECRET: webhookSecret,
    });

    console.log('[ci-seed] Seed completo.');
  } finally {
    await db.dispose();
  }
}

main().catch((err) => {
  console.error('[ci-seed] FALLÓ:', err);
  process.exit(1);
});
