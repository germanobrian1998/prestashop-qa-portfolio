import { chromium, FullConfig } from '@playwright/test';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const BASE_URL = process.env.BASE_URL ?? 'http://localhost';
const ADMIN_FOLDER = process.env.PS_FOLDER_ADMIN ?? 'admin-qa';

const AUTH_DIR = path.join(__dirname, 'playwright/.auth');
const CUSTOMER_AUTH_FILE = path.join(AUTH_DIR, 'customer.json');
const ADMIN_AUTH_FILE = path.join(AUTH_DIR, 'admin.json');

/**
 * Se ejecuta una única vez antes de toda la suite.
 * Genera dos storageState independientes (Front Office / Back Office)
 * para que ningún test mezcle sesión de cliente con sesión de admin.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  await loginCustomer();
  await loginAdmin();
}

async function loginCustomer(): Promise<void> {
  const email = process.env.TEST_CUSTOMER_EMAIL;
  const password = process.env.TEST_CUSTOMER_PASSWORD;
  if (!email || !password) {
    throw new Error('Faltan TEST_CUSTOMER_EMAIL / TEST_CUSTOMER_PASSWORD en .env');
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${BASE_URL}/index.php?controller=authentication`);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: false }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  // No depender de la URL post-login: algunas instalaciones redirigen a una
  // subpágina de cuenta, otras a la home — varía según instalación/idioma.
  // El link de "Cerrar sesión" en el header solo existe con sesión iniciada.
  // .first() porque el theme lo duplica en el DOM (versión desktop + versión
  // mobile con clase `hidden-sm-down`).
  await page.getByRole('link', { name: /cerrar sesión/i }).first().waitFor({ state: 'visible' });

  await page.context().storageState({ path: CUSTOMER_AUTH_FILE });
  await browser.close();
}

async function loginAdmin(): Promise<void> {
  const email = process.env.ADMIN_MAIL;
  const password = process.env.ADMIN_PASSWD;
  if (!email || !password) {
    throw new Error('Faltan ADMIN_MAIL / ADMIN_PASSWD en .env');
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${BASE_URL}/${ADMIN_FOLDER}`);
  // getByLabel('Correo electrónico') matchea dos inputs con la misma
  // etiqueta accesible: el de login (#email) y el del form oculto de
  // "olvidé mi contraseña" (#email_forgot) — dispara modo estricto.
  // Se usa el id específico del form de login en su lugar.
  await page.locator('#email').fill(email);
  // El form de "olvidé mi contraseña" de Back Office solo pide el email,
  // no tiene campo de contraseña — #passwd no tiene duplicado conocido,
  // pero se usa el id igual por consistencia y para no depender del label.
  await page.locator('#passwd').fill(password);
  await page.getByRole('button', { name: /Iniciar sesión|Conectarse/ }).click();

  // El link de logout de Back Office vive dentro de un dropdown colapsado
  // (toggle del ícono de usuario, sin texto/aria-label útil) — hay que
  // abrirlo antes de poder esperarlo visible. El id #header_logout es
  // estable y no ambiguo (a diferencia del toggle, que es un ícono de
  // Material Icons sin label accesible).
  await page.locator('.employee_name.dropdown-toggle').click();
  await page.locator('#header_logout').waitFor({ state: 'visible' });

  await page.context().storageState({ path: ADMIN_AUTH_FILE });
  await browser.close();
}
