import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

export class CartPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get lineItems() {
    return this.page.locator('[data-line-item]', { hasText: '' }).or(
      this.page.locator('.cart-item')
    );
  }

  private get proceedToCheckoutButton() {
    return this.page.getByRole('link', { name: /Finalizar compra|Realizar el pedido|Proceder al pago/ });
  }

  private get totalPrice() {
    return this.page.locator('.cart-total, #total_price');
  }

  async goto(): Promise<void> {
    // No hardcodear la URL del carrito (ej. '/es/carrito?action=show'):
    // depende del idioma configurado y del controller legacy
    // ('controller=cart') no resuelve con URLs amigables en esta
    // instancia — redirige a home. Se clickea el link real del header,
    // mismo patrón que RegisterPage.goto(). .first() porque el theme
    // puede duplicar el link (desktop + mobile), igual que "Cerrar sesión".
    // Flag /i porque el aria-label real ("Enlace al carrito de la compra...")
    // está en minúscula y sobreescribe el nombre accesible del texto visible.
    await this.page.getByRole('link', { name: /Carrito/i }).first().click();
  }

  async getLineItemsCount(): Promise<number> {
    return this.lineItems.count();
  }

  async getTotal(): Promise<string> {
    return (await this.totalPrice.textContent())?.trim() ?? '';
  }

  async proceedToCheckout(): Promise<void> {
    await this.proceedToCheckoutButton.click();
  }

  async updateQuantity(lineIndex: number, quantity: number): Promise<void> {
    const row = this.lineItems.nth(lineIndex);
    await row.getByRole('spinbutton').fill(String(quantity));
    await row.getByRole('spinbutton').press('Enter');
  }

  async removeLine(lineIndex: number): Promise<void> {
    const row = this.lineItems.nth(lineIndex);
    await row.getByRole('button', { name: /Eliminar|Quitar/ }).click();
  }
}
