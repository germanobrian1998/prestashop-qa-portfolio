// src/fixtures/bdd.ts
//
// Fixtures dedicadas para los tests BDD (Sección 6). No reemplaza ni toca
// fixtures/index.ts — ese archivo lo usan los proyectos frontoffice,
// backoffice, api, erp y mobile, y no quiero arriesgar esos 5 proyectos
// por un requisito específico de playwright-bdd.
//
// playwright-bdd necesita que el `test` venga extendido a partir de SU
// PROPIO `test` (no de '@playwright/test' directo), porque ahí inyecta
// las fixtures internas que usa createBdd() para mapear Gherkin → steps.
//
// Un solo archivo compartido por las 3 features BDD (auth, webservice-security,
// checkout) — cada feature usa solo el subconjunto de fixtures que necesita.

import { test as base } from 'playwright-bdd';
import { LoginPage } from '../pages/frontoffice/LoginPage';
import { ProductPage } from '../pages/frontoffice/ProductPage';
import { CartPage } from '../pages/frontoffice/CartPage';
import { CheckoutAddressPage } from '../pages/frontoffice/CheckoutAddressPage';
import { CheckoutShippingPage } from '../pages/frontoffice/CheckoutShippingPage';
import { CheckoutPaymentPage } from '../pages/frontoffice/CheckoutPaymentPage';
import { CheckoutConfirmationPage } from '../pages/frontoffice/CheckoutConfirmationPage';
import { CheckoutFacade } from '../facades/CheckoutFacade';

type BddFixtures = {
  loginPage: LoginPage;
  productPage: ProductPage;
  cartPage: CartPage;
  checkoutAddressPage: CheckoutAddressPage;
  checkoutShippingPage: CheckoutShippingPage;
  checkoutPaymentPage: CheckoutPaymentPage;
  checkoutConfirmationPage: CheckoutConfirmationPage;
  checkoutFacade: CheckoutFacade;
};

export const test = base.extend<BddFixtures>({
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  productPage: async ({ page }, use) => use(new ProductPage(page)),
  cartPage: async ({ page }, use) => use(new CartPage(page)),
  checkoutAddressPage: async ({ page }, use) => use(new CheckoutAddressPage(page)),
  checkoutShippingPage: async ({ page }, use) => use(new CheckoutShippingPage(page)),
  checkoutPaymentPage: async ({ page }, use) => use(new CheckoutPaymentPage(page)),
  checkoutConfirmationPage: async ({ page }, use) => use(new CheckoutConfirmationPage(page)),
  checkoutFacade: async ({ page }, use) => use(new CheckoutFacade(page)),
});

export { expect } from '@playwright/test';
