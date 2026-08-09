import { Page } from '@playwright/test';
import { HomePage } from '../pages/frontoffice/HomePage';
import { ProductPage } from '../pages/frontoffice/ProductPage';
import { CartPage } from '../pages/frontoffice/CartPage';
import { CheckoutAddressPage } from '../pages/frontoffice/CheckoutAddressPage';
import { CheckoutShippingPage } from '../pages/frontoffice/CheckoutShippingPage';
import { CheckoutPaymentPage } from '../pages/frontoffice/CheckoutPaymentPage';
import { CheckoutConfirmationPage } from '../pages/frontoffice/CheckoutConfirmationPage';
import { Customer } from '../factories/CustomerFactory';
import { Product } from '../factories/ProductFactory';
import { Address, AddressFactory } from '../factories/AddressFactory';

export interface PaymentSelection {
  method: 'bankwire' | 'cod' | 'dummy';
}

/**
 * Facade Pattern: encapsula la secuencia completa de checkout
 * (producto → carrito → dirección → envío → pago → confirmación) detrás
 * de un único método de alto nivel, para que los tests no repitan la
 * coreografía de Page Objects en cada spec.
 *
 * Asume que el `page` ya tiene sesión de cliente vía storageState
 * (ver global-setup.ts) — `customer` se usa solo para logging/asserts,
 * no para loguear de nuevo.
 */
export class CheckoutFacade {
  private readonly homePage: HomePage;
  private readonly productPage: ProductPage;
  private readonly cartPage: CartPage;
  private readonly addressPage: CheckoutAddressPage;
  private readonly shippingPage: CheckoutShippingPage;
  private readonly paymentPage: CheckoutPaymentPage;
  private readonly confirmationPage: CheckoutConfirmationPage;

  constructor(page: Page) {
    this.homePage = new HomePage(page);
    this.productPage = new ProductPage(page);
    this.cartPage = new CartPage(page);
    this.addressPage = new CheckoutAddressPage(page);
    this.shippingPage = new CheckoutShippingPage(page);
    this.paymentPage = new CheckoutPaymentPage(page);
    this.confirmationPage = new CheckoutConfirmationPage(page);
  }

  /**
   * Completa una compra de punta a punta para un cliente ya autenticado.
   * `productId` referencia un producto existente en el catálogo (creado
   * previamente vía ProductsApi o parte del catálogo demo).
   *
   * `address` se usa solo si el cliente no tiene ninguna dirección
   * guardada — `CheckoutAddressPage.provideAddress()` decide la rama.
   * Si no se pasa, se genera una con `AddressFactory` por conveniencia
   * (el checkout de un cliente sin direcciones previas la necesita sí o sí).
   */
  async completePurchase(
    _customer: Customer,
    productId: number,
    payment: PaymentSelection = { method: 'bankwire' },
    quantity = 1,
    address: Address = AddressFactory.create()
  ): Promise<{ confirmed: boolean; orderReference: string }> {
    await this.productPage.gotoById(productId);
    await this.productPage.setQuantity(quantity);
    await this.productPage.addToCart();

    await this.cartPage.goto();
    await this.cartPage.proceedToCheckout();

    await this.addressPage.provideAddress(address);
    await this.addressPage.continueToShipping();

    await this.shippingPage.continueToPayment();

    await this.paymentPage.acceptTerms();
    if (payment.method === 'bankwire') {
      await this.paymentPage.selectBankWire();
    } else if (payment.method === 'cod') {
      await this.paymentPage.selectCashOnDelivery();
    } else {
      await this.paymentPage.selectDummyGateway();
    }
    await this.paymentPage.placeOrder();

    const confirmed = await this.confirmationPage.isOrderConfirmed();
    const orderReference = confirmed ? await this.confirmationPage.getOrderReference() : '';

    return { confirmed, orderReference };
  }

  /** Variante que arranca desde una búsqueda, útil para escenarios de catálogo + checkout. */
  async purchaseFirstSearchResult(
    customer: Customer,
    searchTerm: string,
    page: Page,
    payment: PaymentSelection = { method: 'bankwire' }
  ): Promise<{ confirmed: boolean; orderReference: string }> {
    await this.homePage.goto();
    await this.homePage.search(searchTerm);
    await this.homePage.productLinks().first().click();
    await page.waitForLoadState('domcontentloaded');

    const productId = Number(new URL(page.url()).searchParams.get('id_product'));
    if (!productId) {
      throw new Error(`No se pudo extraer id_product de la URL: ${page.url()}`);
    }

    return this.completePurchase(customer, productId, payment);
  }
}

// Re-export de tipo para conveniencia de quien importe solo el Facade.
export type { Product };
