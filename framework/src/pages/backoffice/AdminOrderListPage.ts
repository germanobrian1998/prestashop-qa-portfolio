import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

export class AdminOrderListPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get referenceFilterInput() {
    return this.page.getByPlaceholder(/Referencia/);
  }

  private get orderRows() {
    return this.page.locator('#order_list tbody tr');
  }

  async goto(): Promise<void> {
    await this.navigate('/index.php?controller=AdminOrders');
  }

  async filterByReference(reference: string): Promise<void> {
    await this.referenceFilterInput.fill(reference);
    await this.referenceFilterInput.press('Enter');
  }

  async getStatusForReference(reference: string): Promise<string> {
    const row = this.orderRows.filter({ hasText: reference });
    const statusCell = row.locator('.order-state, td[data-status]').first();
    return (await statusCell.textContent())?.trim() ?? '';
  }

  async openOrderByReference(reference: string): Promise<void> {
    await this.orderRows.filter({ hasText: reference }).first().click();
  }
}
