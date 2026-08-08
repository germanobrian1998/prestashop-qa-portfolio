/**
 * Espejo en TypeScript de `dummypayment/classes/OrderStateTransitionValidator.php`.
 * Se duplica la matriz a propósito (no se puede compartir código entre PHP
 * y TS) pero se aísla en un único archivo, para que los tests de Sección
 * 5.1 no hardcodeen la matriz dispersa en cada `test()` — y para que si la
 * matriz cambia del lado PHP, haya un solo lugar del lado TS a actualizar.
 *
 * IMPORTANTE: si se edita esta matriz, hay que editar la misma matriz en
 * `OrderStateTransitionValidator.php` — no hay forma automática de
 * mantenerlas sincronizadas.
 */

export type OrderPaymentState = 'pending' | 'approved' | 'rejected' | 'timeout';

export type TransitionResult = 'valid' | 'idempotent' | 'invalid';

export const ALL_PAYMENT_STATES: OrderPaymentState[] = ['pending', 'approved', 'rejected', 'timeout'];

const ALLOWED_TRANSITIONS: Record<OrderPaymentState, OrderPaymentState[]> = {
  pending: ['approved', 'rejected', 'timeout'],
  timeout: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};

export function evaluateTransition(from: OrderPaymentState, to: OrderPaymentState): TransitionResult {
  if (from === to) {
    return 'idempotent';
  }
  return ALLOWED_TRANSITIONS[from].includes(to) ? 'valid' : 'invalid';
}

/** Genera las 16 combinaciones (4×4) para tests data-driven de la matriz completa. */
export function allTransitionCases(): Array<{ from: OrderPaymentState; to: OrderPaymentState; expected: TransitionResult }> {
  const cases: Array<{ from: OrderPaymentState; to: OrderPaymentState; expected: TransitionResult }> = [];
  for (const from of ALL_PAYMENT_STATES) {
    for (const to of ALL_PAYMENT_STATES) {
      cases.push({ from, to, expected: evaluateTransition(from, to) });
    }
  }
  return cases;
}
