import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import { Customer } from '../../factories/CustomerFactory';

export class RegisterPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get genderMrRadio() {
    return this.page.getByLabel('Sr.', { exact: false });
  }

  private get firstNameInput() {
    return this.page.getByLabel('Nombre', { exact: true });
  }

  private get lastNameInput() {
    return this.page.getByLabel('Apellidos', { exact: true });
  }

  private get emailInput() {
    return this.page.getByLabel('Correo electrónico');
  }

  private get passwordInput() {
    return this.page.getByLabel('Contraseña', { exact: false });
  }

  private get termsCheckbox() {
    return this.page.getByLabel(
      'Acepto las condiciones generales y la política de confidencialidad',
      { exact: false }
    );
  }

  private get privacyCheckbox() {
    return this.page.getByLabel('Privacidad de los datos del cliente', { exact: false });
  }

  private get saveButton() {
    return this.page.getByRole('button', { name: /Guardar|Registrarse/ });
  }

  async goto(): Promise<void> {
    // No hardcodear la URL del form de registro (ej. '/es/registro'):
    // depende del idioma configurado (PS_LANGUAGE) y varía entre
    // instalaciones. Se navega a home y se clickea el link real —
    // mismo patrón que LoginPage.goToRegister().
    await this.navigate('/');
    await this.page.getByRole('link', { name: /Crear una cuenta|Crear cuenta/i }).click();
  }

  /** Completa y envía el formulario de alta de cliente en Front Office. */
  async register(customer: Customer): Promise<void> {
    await this.firstNameInput.fill(customer.firstName);
    await this.lastNameInput.fill(customer.lastName);
    await this.emailInput.fill(customer.email);
    await this.passwordInput.fill(customer.password);
    // Ambos checkboxes son `required` a nivel HTML5 — sin marcarlos, el
    // navegador bloquea el submit antes de que el form llegue al servidor
    // y no hay error de PrestaShop que capturar. Los otros dos checkboxes
    // del form ("ofertas de socios", "boletín de noticias") son opcionales,
    // no se tocan.
    await this.termsCheckbox.check();
    await this.privacyCheckbox.check();
    await this.saveButton.click();
  }
}
