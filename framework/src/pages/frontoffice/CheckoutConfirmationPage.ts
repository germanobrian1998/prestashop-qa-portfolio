import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

export class CheckoutConfirmationPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get orderConfirmationBanner() {
    return this.page.getByRole('heading', { name: /Su pedido está confirmado/i });
  }

  private get orderReference() {
    return this.page.getByText(/Referencia de pedido:/i);
  }

  async isOrderConfirmed(): Promise<boolean> {
    return this.orderConfirmationBanner.isVisible();
  }

  async getOrderReference(): Promise<string> {
    const text = (await this.orderReference.textContent())?.trim() ?? '';
    return text.replace(/Referencia de pedido:\s*/i, '');
  }
}
