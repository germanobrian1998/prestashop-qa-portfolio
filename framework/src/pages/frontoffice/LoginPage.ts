import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get emailInput() {
    return this.page.getByLabel('Correo electrónico');
  }

  private get passwordInput() {
    return this.page.getByLabel('Contraseña', { exact: false });
  }

  private get submitButton() {
    return this.page.getByRole('button', { name: 'Iniciar sesión' });
  }

  private get createAccountLink() {
    return this.page.getByRole('link', { name: /Crear cuenta|Crear una cuenta/ });
  }

  // FIX confirmado con evidencia real (error-context.md de la corrida):
  // PrestaShop NO renderiza el error de login con role="alert" — es un
  // <ul class="alert alert-danger"><li>Error de autenticación.</li></ul>
  // sin ARIA explícito. getByRole('alert') no matcheaba nada, por eso
  // getErrorMessage() devolvía siempre "". Uso la clase Bootstrap estable
  // .alert-danger como excepción documentada a la estrategia de locators:
  // no es una clase generada dinámicamente por el theme (serían hashes),
  // es una utilidad de Bootstrap fija y predecible.
  private get errorMessage() {
    return this.page.locator('.alert-danger');
  }

  async goto(): Promise<void> {
    await this.navigate('/index.php?controller=authentication');
  }

  async login(email: string, password: string): Promise<import('@playwright/test').Response | null> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    // ⚠️ ASUNCIÓN: asumo que el submit es un POST síncrono con navegación
    // (no AJAX) — coincide con lo visto en el error-context.md (reload
    // completo de la página de login tras el error). Si esto da timeout,
    // es señal de que el form en realidad es AJAX y hay que capturar la
    // response distinto (page.waitForResponse por endpoint AJAX real).
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (res) => res.request().method() === 'POST' && res.request().isNavigationRequest()
      ),
      this.submitButton.click(),
    ]);
    return response;
  }

  async goToRegister(): Promise<void> {
    await this.createAccountLink.click();
  }

  /** Devuelve true si hay sesión de cliente iniciada (link "Cerrar sesión" visible en el header). */
  async isLoggedIn(): Promise<boolean> {
    // .first() porque el theme duplica el link en el DOM (desktop + mobile).
    return this.page.getByRole('link', { name: /cerrar sesión/i }).first().isVisible();
  }

  /** Texto del mensaje de error tras un intento de login fallido. Vacío si no hay ninguno visible. */
  async getErrorMessage(): Promise<string> {
    if (!(await this.errorMessage.first().isVisible().catch(() => false))) {
      return '';
    }
    return (await this.errorMessage.first().textContent())?.trim() ?? '';
  }
}
