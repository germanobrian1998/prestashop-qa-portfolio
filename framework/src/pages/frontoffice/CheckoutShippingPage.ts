import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * Paso 3 del checkout (Envío). Antes de este Page Object, el botón
 * "Continuar" de este paso quedaba sin clickear en el Facade — el
 * checkout se quedaba atascado acá y el paso 4 (Pago) nunca se renderizaba.
 */
export class CheckoutShippingPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get continueButton() {
    return this.page.getByRole('button', { name: /Continuar/ }).first();
  }

  async continueToPayment(): Promise<void> {
    await this.continueButton.click();
  }
}
