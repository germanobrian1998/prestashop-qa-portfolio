import { Locator, Page } from '@playwright/test';

/**
 * Clase base para todos los Page Objects (Front Office y Back Office).
 * Aplica Open/Closed: se extiende para agregar comportamiento específico
 * de cada página, sin modificar los métodos comunes acá definidos.
 */
export abstract class BasePage {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Navega a una ruta relativa a la baseURL configurada en el proyecto. */
  async navigate(path: string = ''): Promise<void> {
    // Un path que arranca con '/' se resuelve como absoluto respecto al
    // origen y descarta cualquier subpath del baseURL (mismo patrón que
    // el bug de WebserviceClient/buildPath). Se quita la barra inicial
    // para que la resolución respete el baseURL completo, incluido
    // subpath (ej. backoffice: http://localhost/admin-qa/).
    const relativePath = path.replace(/^\//, '');
    await this.page.goto(relativePath);
  }

  /** Espera a que un locator esté visible, con timeout explícito opcional. */
  async waitForElement(locator: Locator, timeoutMs = 10_000): Promise<void> {
    await locator.waitFor({ state: 'visible', timeout: timeoutMs });
  }

  /**
   * Devuelve el texto del primer mensaje de error de validación visible
   * en la página. Prioriza `getByRole('alert')` — los componentes de alerta
   * de Bootstrap que usa el theme de PrestaShop (Front Office y Back Office)
   * exponen `role="alert"` — y cae a los selectores CSS conocidos
   * (`.alert-danger`, `#center_column .alert`) si ese rol no está presente.
   * Común a formularios de registro, login y checkout en Front Office, y
   * formularios de Back Office.
   *
   * Como último recurso, cubre el rechazo client-side: si un campo `required`,
   * `minlength`, `type="email"`, etc. bloqueó el submit vía validación HTML5
   * nativa del navegador, el form nunca llega al servidor y no hay alerta
   * que capturar — pero el campo inválido expone su propio mensaje vía
   * `validationMessage`. Nota: ese texto lo genera el navegador en su propio
   * idioma (no el de PrestaShop), así que sirve para `toBeTruthy()` / debugging,
   * no para comparar contra un copy exacto.
   */
  async getValidationError(): Promise<string | null> {
    const roleLocator = this.page.getByRole('alert').first();
    if (await roleLocator.count() > 0) {
      await this.waitForElement(roleLocator);
      return (await roleLocator.textContent())?.trim() ?? null;
    }

    const cssLocator = this.page
      .locator('.alert-danger, .alert.alert-danger, #center_column .alert')
      .first();
    if (await cssLocator.count() > 0) {
      await this.waitForElement(cssLocator);
      return (await cssLocator.textContent())?.trim() ?? null;
    }

    // `:invalid` también matchea el <form> contenedor (los navegadores
    // propagan el estado inválido al form), y como el <form> suele
    // aparecer antes que sus inputs en el DOM, un selector genérico
    // `:invalid` con `.first()` puede devolver el form en vez del campo
    // real — el form no tiene `validationMessage`. Se acota a los
    // controles de formulario reales (input/select/textarea).
    const invalidField = this.page.locator('input:invalid, select:invalid, textarea:invalid').first();
    if (await invalidField.count() > 0) {
      return invalidField.evaluate((el: HTMLInputElement) => el.validationMessage || null);
    }

    return null;
  }

  /** Título de la página actual, útil para asserts genéricos de navegación. */
  async getTitle(): Promise<string> {
    return this.page.title();
  }
}
