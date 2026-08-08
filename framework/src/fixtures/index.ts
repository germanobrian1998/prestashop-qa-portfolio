import { test as base } from '@playwright/test';

import { LoginPage } from '../pages/frontoffice/LoginPage';
import { RegisterPage } from '../pages/frontoffice/RegisterPage';
import { HomePage } from '../pages/frontoffice/HomePage';
import { ProductPage } from '../pages/frontoffice/ProductPage';
import { CartPage } from '../pages/frontoffice/CartPage';
import { CheckoutAddressPage } from '../pages/frontoffice/CheckoutAddressPage';
import { CheckoutShippingPage } from '../pages/frontoffice/CheckoutShippingPage';
import { CheckoutPaymentPage } from '../pages/frontoffice/CheckoutPaymentPage';
import { CheckoutConfirmationPage } from '../pages/frontoffice/CheckoutConfirmationPage';
import { AccountPage } from '../pages/frontoffice/AccountPage';

import { AdminLoginPage } from '../pages/backoffice/AdminLoginPage';
import { AdminProductListPage } from '../pages/backoffice/AdminProductListPage';
import { AdminOrderListPage } from '../pages/backoffice/AdminOrderListPage';
import { AdminCustomerListPage } from '../pages/backoffice/AdminCustomerListPage';

import { CheckoutFacade } from '../facades/CheckoutFacade';
import { WebserviceClient } from '../api/WebserviceClient';
import { ProductsApi } from '../api/ProductsApi';
import { OrdersApi } from '../api/OrdersApi';
import { DummyPaymentWebhookClient } from '../api/DummyPaymentWebhookClient';

/**
 * Dependency Inversion: los tests declaran qué Page Objects / facades /
 * clientes API necesitan como parámetros del test callback — Playwright
 * los construye e inyecta. Los tests nunca hacen `new LoginPage(page)`
 * directamente.
 */
type Fixtures = {
  // Front Office
  loginPage: LoginPage;
  registerPage: RegisterPage;
  homePage: HomePage;
  productPage: ProductPage;
  cartPage: CartPage;
  checkoutAddressPage: CheckoutAddressPage;
  checkoutShippingPage: CheckoutShippingPage;
  checkoutPaymentPage: CheckoutPaymentPage;
  checkoutConfirmationPage: CheckoutConfirmationPage;
  accountPage: AccountPage;

  // Back Office
  adminLoginPage: AdminLoginPage;
  adminProductListPage: AdminProductListPage;
  adminOrderListPage: AdminOrderListPage;
  adminCustomerListPage: AdminCustomerListPage;

  // Facades
  checkoutFacade: CheckoutFacade;

  // API
  webserviceClient: WebserviceClient;
  productsApi: ProductsApi;
  ordersApi: OrdersApi;
  dummyPaymentWebhookClient: DummyPaymentWebhookClient;
};

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  registerPage: async ({ page }, use) => use(new RegisterPage(page)),
  homePage: async ({ page }, use) => use(new HomePage(page)),
  productPage: async ({ page }, use) => use(new ProductPage(page)),
  cartPage: async ({ page }, use) => use(new CartPage(page)),
  checkoutAddressPage: async ({ page }, use) => use(new CheckoutAddressPage(page)),
  checkoutShippingPage: async ({ page }, use) => use(new CheckoutShippingPage(page)),
  checkoutPaymentPage: async ({ page }, use) => use(new CheckoutPaymentPage(page)),
  checkoutConfirmationPage: async ({ page }, use) => use(new CheckoutConfirmationPage(page)),
  accountPage: async ({ page }, use) => use(new AccountPage(page)),

  adminLoginPage: async ({ page }, use) => use(new AdminLoginPage(page)),
  adminProductListPage: async ({ page }, use) => use(new AdminProductListPage(page)),
  adminOrderListPage: async ({ page }, use) => use(new AdminOrderListPage(page)),
  adminCustomerListPage: async ({ page }, use) => use(new AdminCustomerListPage(page)),

  checkoutFacade: async ({ page }, use) => use(new CheckoutFacade(page)),

  webserviceClient: async ({}, use) => {
    const client = await WebserviceClient.create();
    await use(client);
    await client.dispose();
  },
  productsApi: async ({ webserviceClient }, use) => use(new ProductsApi(webserviceClient)),
  ordersApi: async ({ webserviceClient }, use) => use(new OrdersApi(webserviceClient)),

  dummyPaymentWebhookClient: async ({}, use) => {
    const client = await DummyPaymentWebhookClient.create();
    await use(client);
    await client.dispose();
  },
});

export { expect } from '@playwright/test';
