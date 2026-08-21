import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

export class AdminProductListPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get searchFilterInput() {
    return this.page.getByRole('textbox', { name: 'product_name' });
  }

  private get searchButton() {
    return this.page.getByRole('button', { name: /Buscar/i });
  }

  private get catalogMenuLink() {
    return this.page.getByRole('link', { name: /Catálogo/ }).first();
  }

  private get productsMenuLink() {
    // Acotado a #subtab-AdminProducts (el <li> del menú lateral) --
    // sin esto, el locator también matchea el link "Productos" del
    // breadcrumb cuando ambos coexisten brevemente en el DOM durante
    // la transición SPA de PrestaShop 8.1 (confirmado en CI: "strict
    // mode violation ... resolved to 2 elements", con Playwright
    // sugiriendo esta misma disambiguación en el mensaje de error).
    return this.page.locator('#subtab-AdminProducts').getByRole('link', { name: 'Productos', exact: true });
  }

  private get productRows() {
    // La tabla real de products-v2 no tiene id="product_list" ni clase
    // "product-list-row" (asunción legacy incorrecta). Es un <table> HTML
    // estándar con <thead> (encabezados + fila de filtros) y <tbody>
    // (solo filas de datos) — confirmado con snapshot ARIA (dos rowgroup
    // separados) y visualmente (una sola tabla en pantalla, sin ambigüedad).
    return this.page.locator('table tbody tr');
  }

  private get addNewProductButton() {
    return this.page.getByRole('link', { name: /Añadir un nuevo producto/i });
  }

  async goto(): Promise<void> {
    // El controller legacy (?controller=AdminProducts) sin token no lleva
    // al listado — PS 8.1.7 usa rutas nuevas tipo /sell/catalog/products-v2/
    // con token dinámico por sesión, no hardcodeable. Se navega por el
    // menú real, mismo patrón que RegisterPage/CartPage en Front Office.
    await this.navigate('/');
    await this.catalogMenuLink.click();
    await this.productsMenuLink.click();
  }

  async filterByName(name: string): Promise<void> {
    await this.searchFilterInput.fill(name);
    await this.searchButton.click();
  }

  async getResultsCount(): Promise<number> {
    return this.productRows.count();
  }

  async openNewProductForm(): Promise<void> {
    await this.addNewProductButton.click();
  }

  rowByName(name: string) {
    return this.productRows.filter({ hasText: name });
  }
}
