import { test, expect } from '../../fixtures';
import { CustomerFactory } from '../../factories/CustomerFactory';
import { allTransitionCases, OrderPaymentState } from '../../api/OrderStateTransitionMatrix';
import { createOrderInState } from './helpers';

/**
 * Sección 5.1 — módulo de pago dummy. Test Design: State Transition sobre
 * los 4 estados simulados, aplicando el mismo criterio que la Sección 4
 * (Planificación) — incluye transiciones inválidas, no solo el camino feliz.
 *
 * Estrategia de datos: por cada "from" solo se puede aplicar UNA transición
 * que realmente mute el pedido (las demás dejarían de ser válidas contra
 * ese mismo pedido una vez aplicada). Por eso el archivo separa:
 *   - Transiciones inválidas + idempotentes: no mutan nada, se reutiliza
 *     un único pedido por estado "from" (createOrderInState) para las N
 *     aserciones de ese grupo.
 *   - Transiciones válidas: cada una necesita su propio pedido fresco,
 *     porque aplicarla consume el estado "from" de ese pedido.
 */

test.describe('Dummy Payment — transiciones inválidas e idempotentes @payment @regression', () => {
  const nonMutatingByFrom = new Map<
    OrderPaymentState,
    Array<{ to: OrderPaymentState; expected: 'invalid' | 'idempotent' }>
  >();

  for (const { from, to, expected } of allTransitionCases()) {
    if (expected === 'valid') continue;
    const list = nonMutatingByFrom.get(from) ?? [];
    list.push({ to, expected });
    nonMutatingByFrom.set(from, list);
  }

  for (const [from, cases] of nonMutatingByFrom) {
    test(`desde "${from}": ${cases.length} transiciones no válidas/idempotentes`, async ({
      checkoutFacade,
      dummyPaymentWebhookClient,
    }) => {
      const customer = CustomerFactory.create({ email: process.env.TEST_CUSTOMER_EMAIL });
      const orderReference = await createOrderInState(checkoutFacade, dummyPaymentWebhookClient, customer, from);

      for (const { to, expected } of cases) {
        const result = await dummyPaymentWebhookClient.confirm(orderReference, to);

        if (expected === 'idempotent') {
          expect(result.status, `"${from}" → "${to}" (mismo estado) debería ser idempotente`).toBe(200);
          expect(result.body.idempotent).toBe(true);
          expect(result.body.currentStatus).toBe(from);
        } else {
          expect(result.status, `"${from}" → "${to}" debería ser una transición inválida`).toBe(409);
          expect(result.body.success).toBe(false);
          expect(result.body.error).toBe('invalid_transition');
        }
      }
    });
  }
});

test.describe('Dummy Payment — transiciones válidas @payment @regression', () => {
  const validCases = allTransitionCases().filter((c) => c.expected === 'valid');

  for (const { from, to } of validCases) {
    test(`"${from}" → "${to}" se aplica correctamente`, async ({ checkoutFacade, dummyPaymentWebhookClient }) => {
      const customer = CustomerFactory.create({ email: process.env.TEST_CUSTOMER_EMAIL });
      const orderReference = await createOrderInState(checkoutFacade, dummyPaymentWebhookClient, customer, from);

      const result = await dummyPaymentWebhookClient.confirm(orderReference, to);

      expect(result.status).toBe(200);
      expect(result.body.success).toBe(true);
      expect(result.body.idempotent).toBe(false);
      expect(result.body.previousStatus).toBe(from);
      expect(result.body.currentStatus).toBe(to);
    });
  }
});

test.describe('Dummy Payment — escenarios narrativos @payment @smoke', () => {
  test('doble confirmación: la segunda llamada es idempotente, no un error', async ({
    checkoutFacade,
    dummyPaymentWebhookClient,
  }) => {
    const customer = CustomerFactory.create({ email: process.env.TEST_CUSTOMER_EMAIL });
    const orderReference = await createOrderInState(checkoutFacade, dummyPaymentWebhookClient, customer, 'pending');

    const first = await dummyPaymentWebhookClient.confirm(orderReference, 'approved');
    expect(first.status).toBe(200);
    expect(first.body.idempotent).toBe(false);

    // Mismo gateway, misma confirmación, llega dos veces (reintento de red
    // típico de un webhook real) — no debería duplicar efectos ni fallar.
    const second = await dummyPaymentWebhookClient.confirm(orderReference, 'approved');
    expect(second.status).toBe(200);
    expect(second.body.idempotent).toBe(true);
    expect(second.body.currentStatus).toBe('approved');
  });

  test('confirmación fuera de orden: un timeout se puede reconciliar más tarde a aprobado', async ({
    checkoutFacade,
    dummyPaymentWebhookClient,
  }) => {
    const customer = CustomerFactory.create({ email: process.env.TEST_CUSTOMER_EMAIL });
    // El cliente "abandonó" el checkout tras el timeout — no hay ninguna
    // página esperando esta respuesta cuando el gateway confirma tarde.
    const orderReference = await createOrderInState(checkoutFacade, dummyPaymentWebhookClient, customer, 'timeout');

    const lateConfirmation = await dummyPaymentWebhookClient.confirm(orderReference, 'approved');

    expect(lateConfirmation.status).toBe(200);
    expect(lateConfirmation.body.success).toBe(true);
    expect(lateConfirmation.body.previousStatus).toBe('timeout');
    expect(lateConfirmation.body.currentStatus).toBe('approved');
  });

  test('rechazado → aprobado está bloqueado (requiere intervención manual)', async ({
    checkoutFacade,
    dummyPaymentWebhookClient,
  }) => {
    const customer = CustomerFactory.create({ email: process.env.TEST_CUSTOMER_EMAIL });
    const orderReference = await createOrderInState(checkoutFacade, dummyPaymentWebhookClient, customer, 'rejected');

    const result = await dummyPaymentWebhookClient.confirm(orderReference, 'approved');

    expect(result.status).toBe(409);
    expect(result.body.error).toBe('invalid_transition');
  });
});
