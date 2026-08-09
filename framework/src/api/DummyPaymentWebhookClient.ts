import { APIRequestContext, request } from '@playwright/test';
import { createHmac } from 'crypto';
import { OrderPaymentState } from './OrderStateTransitionMatrix';

export interface WebhookResponse {
  status: number;
  body: {
    success: boolean;
    previousStatus?: OrderPaymentState;
    currentStatus?: OrderPaymentState | null;
    idempotent?: boolean;
    error?: string;
  };
}

/**
 * Cliente del webhook de confirmación asíncrona del módulo dummy
 * (Sección 5.1). Reproduce del lado TS exactamente la firma que valida
 * `DummyPaymentWebhookAuth::verify()` en PHP:
 *   HMAC-SHA256("orderReference|targetStatus", secreto)
 *
 * El secreto se obtiene una vez desde `DummyPayment::getContent()` en
 * Back Office y se pega en `WEBSERVICE_WEBHOOK_SECRET` del `.env` — no
 * hay forma de que el test lo descubra por su cuenta (a propósito: el
 * webhook no es un endpoint abierto).
 */
export class DummyPaymentWebhookClient {
  private constructor(
    private readonly context: APIRequestContext,
    private readonly secret: string
  ) {}

  static async create(
    secret: string = process.env.WEBSERVICE_WEBHOOK_SECRET ?? '',
    baseURL: string = `${process.env.BASE_URL ?? 'http://localhost'}/`
  ): Promise<DummyPaymentWebhookClient> {
    if (!secret) {
      throw new Error(
        'WEBSERVICE_WEBHOOK_SECRET no está definida. Copiarla desde Back Office > Módulos > Dummy Payment (QA) > Configurar.'
      );
    }

    const context = await request.newContext({ baseURL });
    return new DummyPaymentWebhookClient(context, secret);
  }

  private sign(orderReference: string, targetStatus: OrderPaymentState): string {
    return createHmac('sha256', this.secret).update(`${orderReference}|${targetStatus}`).digest('hex');
  }

  /**
   * Dispara la confirmación asíncrona. `path` sigue el patrón de ruta
   * amigable de módulos de PrestaShop (`/module/dummypayment/webhook`) —
   * sin confirmar todavía contra la instancia real, igual que el resto
   * de rutas nuevas del scaffold.
   */
  async confirm(orderReference: string, targetStatus: OrderPaymentState): Promise<WebhookResponse> {
    const signature = this.sign(orderReference, targetStatus);

    const response = await this.context.post('module/dummypayment/webhook', {
      data: { orderReference, targetStatus, signature },
      headers: { 'Content-Type': 'application/json' },
    });

    return { status: response.status(), body: await response.json() };
  }

  /** Variante para testear firma inválida deliberadamente (Sección 6, security checks). */
  async confirmWithRawSignature(
    orderReference: string,
    targetStatus: OrderPaymentState,
    signature: string
  ): Promise<WebhookResponse> {
    const response = await this.context.post('module/dummypayment/webhook', {
      data: { orderReference, targetStatus, signature },
      headers: { 'Content-Type': 'application/json' },
    });

    return { status: response.status(), body: await response.json() };
  }

  async dispose(): Promise<void> {
    await this.context.dispose();
  }
}
