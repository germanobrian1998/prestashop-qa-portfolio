import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

export class AdminCustomerListPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get emailFilterInput() {
    return this.page.getByPlaceholder(/Correo electrónico/);
  }

  private get customerRows() {
    return this.page.locator('#customer_list tbody tr');
  }

  async goto(): Promise<void> {
    await this.navigate('/index.php?controller=AdminCustomers');
  }

  async filterByEmail(email: string): Promise<void> {
    await this.emailFilterInput.fill(email);
    await this.emailFilterInput.press('Enter');
  }

  async existsCustomerWithEmail(email: string): Promise<boolean> {
    await this.filterByEmail(email);
    return (await this.customerRows.count()) > 0;
  }
}
