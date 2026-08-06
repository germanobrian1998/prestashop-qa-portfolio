import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * Método de pago de test fijado (ver Sección 5, Planificación): transferencia
 * bancaria o contra reembolso — sin gateway externo. Cuando el módulo dummy
 * de la Sección 5.1 esté implementado, este page object se extiende con el
 * método `selectDummyGateway()` correspondiente.
 */
export class CheckoutPaymentPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // Texto distinto al checkbox de "condiciones" del formulario de registro
  // (RegisterPage.termsCheckbox) — cada parte del sitio usa su propio copy
  // para "aceptar términos". Este es específico del paso de Pago.
  private get termsCheckbox() {
    return this.page.getByLabel(/Estoy de acuerdo con los términos/);
  }

  // Radios, no links — corregido tras confirmar el rol real con snapshot.
  private paymentOption(name: string) {
    return this.page.getByRole('radio', { name: new RegExp(name, 'i') });
  }

  private get placeOrderButton() {
    return this.page.getByRole('button', { name: /Realizar pedido/i });
  }

  async goto(): Promise<void> {
    await this.navigate('/index.php?controller=order');
  }

  async acceptTerms(): Promise<void> {
    await this.termsCheckbox.check();
  }

  async selectBankWire(): Promise<void> {
    await this.paymentOption('Pago por transferencia bancaria').check();
  }

  async selectCashOnDelivery(): Promise<void> {
    // Texto real confirmado: "Pago contra reembolso" — el regex actual
    // (/Contra reembolso/i) matchea igual por ser parcial, no exige
    // coincidencia completa del nombre accesible.
    await this.paymentOption('Contra reembolso').check();
  }

  /** Submit final del checkout — confirma el pedido y espera la navegación resultante. */
  async placeOrder(): Promise<void> {
    // No usar 'networkidle' (ver BasePage.ts — mismo motivo: puede
    // colgarse con polling/analytics de fondo) ni un regex de URL de
    // confirmación sin confirmar (ya nos pasó con RegisterPage y
    // AdminDashboard en esta misma sesión). En su lugar, esperar a que
    // la URL simplemente cambie respecto a la actual — agnóstico al
    // patrón real de la URL de confirmación.
    const previousUrl = this.page.url();
    await this.placeOrderButton.click();
    await this.page.waitForURL((url) => url.toString() !== previousUrl, { timeout: 15_000 });
  }
}
