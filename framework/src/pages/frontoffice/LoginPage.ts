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

  async goto(): Promise<void> {
    await this.navigate('/index.php?controller=authentication');
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async goToRegister(): Promise<void> {
    await this.createAccountLink.click();
  }

  /** Devuelve true si hay sesión de cliente iniciada (link "Cerrar sesión" visible en el header). */
  async isLoggedIn(): Promise<boolean> {
    // .first() porque el theme duplica el link en el DOM (desktop + mobile).
    return this.page.getByRole('link', { name: /cerrar sesión/i }).first().isVisible();
  }
}
