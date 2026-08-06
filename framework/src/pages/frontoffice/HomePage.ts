import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

export class HomePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get searchInput() {
    return this.page.getByPlaceholder('Buscar');
  }

  // .first() por el mismo motivo que CartPage.goto(): el theme puede
  // duplicar este link (desktop + mobile). Flag /i porque el aria-label
  // real está en minúscula y sobreescribe el nombre accesible del texto.
  private get cartPreviewLink() {
    return this.page.getByRole('link', { name: /Carrito/i }).first();
  }

  async goto(): Promise<void> {
    await this.navigate('/');
  }

  async search(term: string): Promise<void> {
    await this.searchInput.fill(term);
    await this.searchInput.press('Enter');
  }

  async openCartPreview(): Promise<void> {
    await this.cartPreviewLink.click();
  }

  /** Devuelve los links de producto visibles en el listado actual (home / resultados). */
  productLinks() {
    return this.page.getByRole('link', { name: /.+/ }).locator('article a');
  }
}
