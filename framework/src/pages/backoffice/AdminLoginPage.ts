import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

export class AdminLoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // getByLabel('Correo electrónico') matchea dos inputs con la misma
  // etiqueta accesible: el de login (#email) y el del form oculto de
  // "olvidé mi contraseña" (#email_forgot) — dispara modo estricto.
  private get emailInput() {
    return this.page.locator('#email');
  }

  // El form de "olvidé mi contraseña" solo pide email, sin campo de
  // contraseña — #passwd no tiene duplicado conocido, pero se usa el id
  // igual por consistencia con emailInput y para no depender del label.
  private get passwordInput() {
    return this.page.locator('#passwd');
  }

  private get submitButton() {
    return this.page.getByRole('button', { name: /Iniciar sesión|Conectarse/ });
  }

  async goto(): Promise<void> {
    await this.navigate('/');
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  /**
   * Devuelve true si hay sesión de admin iniciada. Chequea presencia en el
   * DOM de `#header_logout` (no visibilidad): ese link vive dentro de un
   * dropdown colapsado por defecto, así que puede existir en el DOM con
   * `display: none` heredado del menú cerrado — `isVisible()` daría un
   * falso negativo con sesión iniciada. El id es estable y no ambiguo,
   * así que basta con confirmar que el elemento existe.
   */
  async isLoggedIn(): Promise<boolean> {
    return (await this.page.locator('#header_logout').count()) > 0;
  }
}
