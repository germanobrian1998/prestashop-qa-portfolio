import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

export class ProductPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get quantityInput() {
    return this.page.getByLabel('Cantidad');
  }

  private get addToCartButton() {
    return this.page.getByRole('button', { name: /Añadir al carrito/ });
  }

  private get productTitle() {
    return this.page.getByRole('heading', { level: 1 });
  }

  async gotoById(productId: number): Promise<void> {
    await this.navigate(`/index.php?controller=product&id_product=${productId}`);
  }

  async setQuantity(quantity: number): Promise<void> {
    await this.quantityInput.fill(String(quantity));
  }

  async addToCart(): Promise<void> {
    await this.addToCartButton.click();
    // El modal de confirmación (#blockcart-modal) queda abierto tras
    // agregar el producto y tapa el header, interceptando clics
    // posteriores (ej. al link "Carrito"). Se cierra acá — ProductPage
    // es dueña de la acción que lo abre, así que le corresponde dejar
    // la página en estado limpio, en vez de que cada método que
    // interactúe con el header después tenga que esquivarlo.
    const closeButton = this.page.locator('#blockcart-modal button.close');
    await closeButton.waitFor({ state: 'visible', timeout: 5_000 });
    await closeButton.click();
    await closeButton.waitFor({ state: 'hidden', timeout: 5_000 });
  }

  async getProductName(): Promise<string> {
    return (await this.productTitle.textContent())?.trim() ?? '';
  }
}
