import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

export class AccountPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get orderHistoryLink() {
    return this.page.getByRole('link', { name: /Pedidos|Historial de pedidos/ });
  }

  private get welcomeMessage() {
    return this.page.locator('.account-welcome, #maincontent h1');
  }

  async goto(): Promise<void> {
    await this.navigate('/index.php?controller=my-account');
  }

  async goToOrderHistory(): Promise<void> {
    await this.orderHistoryLink.click();
  }

  async getWelcomeText(): Promise<string> {
    return (await this.welcomeMessage.textContent())?.trim() ?? '';
  }
}
