import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * Método de pago de test fijado (ver Sección 5, Planificación): transferencia
 * bancaria o contra reembolso — sin gateway externo. La Sección 5.1 agrega
 * `selectDummyGateway()` para el módulo de pago simulado, que sí permite
 * testear confirmación asíncrona vía webhook.
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

  /**
   * Selecciona el módulo de pago dummy (Sección 5.1). El nombre accesible
   * del radio sale del `callToActionText` definido en
   * `DummyPayment::hookPaymentOptions()` — sin confirmar todavía contra
   * la instancia real, mismo criterio de honestidad que el resto del
   * scaffold: se corrige con evidencia real cuando se corra por primera vez.
   */
  async selectDummyGateway(): Promise<void> {
    await this.paymentOption('Pago simulado').check();
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

  /**
   * NUEVO (Sección 6, escenario negativo): a diferencia de placeOrder(),
   * NO asume que va a haber navegación tras el click — el objetivo de este
   * método es justamente probar qué pasa cuando no hay método de pago
   * seleccionado, y no sé de antemano si PrestaShop bloquea el submit del
   * lado del cliente (el click no dispara nada) o si navega y vuelve con
   * un error server-side. Si el click tira timeout (botón deshabilitado
   * o similar), se traga el error a propósito — es información válida
   * para el step que llama a este método, no una falla del método en sí.
   */
  async attemptPlaceOrderWithoutSelectingMethod(): Promise<void> {
    await this.placeOrderButton.click({ timeout: 5_000 }).catch(() => {
      // Intencional: ver comentario arriba.
    });
  }
}
