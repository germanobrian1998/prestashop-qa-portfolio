import { CheckoutFacade } from '../../facades/CheckoutFacade';
import { DummyPaymentWebhookClient } from '../../api/DummyPaymentWebhookClient';
import { OrderPaymentState } from '../../api/OrderStateTransitionMatrix';
import { Customer } from '../../factories/CustomerFactory';

/**
 * Corre el checkout completo (Sección 5) con el método de pago dummy y
 * devuelve la referencia del pedido resultante, en estado "pending".
 * `productId: 1` asume el catálogo demo — mismo criterio que el resto
 * de la suite de checkout.
 */
export async function createPendingOrder(
  checkoutFacade: CheckoutFacade,
  customer: Customer
): Promise<string> {
  const result = await checkoutFacade.completePurchase(customer, 1, { method: 'dummy' });

  if (!result.confirmed || !result.orderReference) {
    throw new Error('No se pudo crear el pedido pendiente de precondición — el checkout no confirmó.');
  }

  return result.orderReference;
}

/**
 * Crea un pedido y lo lleva al estado pedido vía webhook, en un solo hop
 * (los 4 estados son alcanzables en ≤1 salto desde "pending" según la
 * matriz — ver OrderStateTransitionMatrix.ts). Lanza si el hop de
 * bootstrap falla, para no arrancar un test con una precondición rota.
 */
export async function createOrderInState(
  checkoutFacade: CheckoutFacade,
  webhookClient: DummyPaymentWebhookClient,
  customer: Customer,
  targetState: OrderPaymentState
): Promise<string> {
  const orderReference = await createPendingOrder(checkoutFacade, customer);

  if (targetState === 'pending') {
    return orderReference;
  }

  const bootstrap = await webhookClient.confirm(orderReference, targetState);
  if (!bootstrap.body.success) {
    throw new Error(
      `No se pudo bootstrapear el pedido ${orderReference} a estado "${targetState}": ${JSON.stringify(bootstrap.body)}`
    );
  }

  return orderReference;
}
