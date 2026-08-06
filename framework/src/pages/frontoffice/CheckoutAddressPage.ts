import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import { Address } from '../../factories/AddressFactory';

export class CheckoutAddressPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get useExistingAddressOption() {
    return this.page.locator('input[name="id_address_delivery"]').first();
  }

  private get continueButton() {
    return this.page.getByRole('button', { name: /Continuar/ }).first();
  }

  // field-address1 confirmado por strict-mode violation real (getByLabel
  // matcheaba 3 elementos: el input, "Dirección Complementaria" y un
  // checkbox). El resto de los ids sigue el mismo patrón de nomenclatura
  // del theme classic de PrestaShop (field-<nombre del campo del form>),
  // pero están INFERIDOS por convención, no confirmados contra el DOM real
  // — si alguno no matchea, es el primer sospechoso a ajustar.
  private get address1Input() {
    return this.page.locator('#field-address1');
  }

  private get cityInput() {
    return this.page.locator('#field-city');
  }

  private get postcodeInput() {
    return this.page.locator('#field-postcode');
  }

  private get countrySelect() {
    return this.page.locator('#field-id_country');
  }

  private get stateSelect() {
    return this.page.locator('#field-id_state');
  }

  private get phoneInput() {
    return this.page.locator('#field-phone');
  }

  async goto(): Promise<void> {
    await this.navigate('/index.php?controller=order');
  }

  /**
   * true si el checkout ofrece un radio de dirección ya guardada.
   * Un cliente creado solo vía registro Front Office (sin alta de
   * dirección previa) no tiene ninguna — PrestaShop muestra directo el
   * formulario de alta en ese caso.
   */
  async hasExistingAddress(): Promise<boolean> {
    return (await this.useExistingAddressOption.count()) > 0;
  }

  /** Usa la dirección ya cargada en la cuenta del cliente logueado. */
  async useExistingAddress(): Promise<void> {
    await this.useExistingAddressOption.check();
  }

  /** Completa el formulario de alta de dirección nueva. */
  async fillNewAddress(address: Address): Promise<void> {
    await this.address1Input.fill(address.address1);
    await this.cityInput.fill(address.city);
    await this.postcodeInput.fill(address.postcode);
    await this.countrySelect.selectOption({ label: address.country });
    if (address.state) {
      // No todos los países piden provincia/estado — solo completar si el
      // select existe (ej. Argentina lo requiere, otros países no).
      if ((await this.stateSelect.count()) > 0) {
        await this.stateSelect.selectOption({ label: address.state });
      }
    }
    await this.phoneInput.fill(address.phone);
  }

  /**
   * Orquesta el paso de dirección: usa la existente si el checkout la
   * ofrece, o completa el formulario de alta nueva en caso contrario.
   * Evita que el Facade (u otros consumidores) tengan que conocer la rama.
   */
  async provideAddress(address: Address): Promise<void> {
    if (await this.hasExistingAddress()) {
      await this.useExistingAddress();
    } else {
      await this.fillNewAddress(address);
    }
  }

  async continueToShipping(): Promise<void> {
    await this.continueButton.click();
  }
}
