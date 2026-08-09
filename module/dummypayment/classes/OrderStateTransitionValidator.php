<?php
/**
 * Valida transiciones entre los 4 estados simulados del módulo de pago
 * dummy (pending → approved → rejected → timeout), según la matriz de
 * Test Design de la Sección 5.1.
 *
 * Reglas (State Transition):
 * - pending  → approved | rejected | timeout   (flujo normal / timeout del gateway)
 * - timeout  → approved | rejected             (confirmación tardía del gateway,
 *                                                 legítima: el cliente ya abandonó
 *                                                 el checkout, pero el gateway sigue
 *                                                 respondiendo — no es lo mismo que
 *                                                 "rechazado → aprobado").
 * - approved → (ninguna, estado terminal)
 * - rejected → (ninguna, estado terminal — rechazado → aprobado NO es una
 *                transición automática válida; requiere intervención manual
 *                desde Back Office, fuera del alcance de este módulo/webhook)
 * - X → X (mismo estado) → IDEMPOTENTE, no es un error. Cubre el escenario
 *          de doble confirmación del gateway: la segunda llamada no debe
 *          fallar ni duplicar efectos secundarios.
 *
 * No depende de nada de PrestaShop a propósito — es una unidad pura,
 * testeable en aislamiento (unit test PHP) y también vía el webhook desde
 * los tests de Playwright, sin duplicar la matriz en dos lugares.
 */
class OrderStateTransitionValidator
{
    public const STATE_PENDING = 'pending';
    public const STATE_APPROVED = 'approved';
    public const STATE_REJECTED = 'rejected';
    public const STATE_TIMEOUT = 'timeout';

    public const RESULT_VALID = 'valid';
    public const RESULT_IDEMPOTENT = 'idempotent';
    public const RESULT_INVALID = 'invalid';

    public const ALL_STATES = [
        self::STATE_PENDING,
        self::STATE_APPROVED,
        self::STATE_REJECTED,
        self::STATE_TIMEOUT,
    ];

    /** @var array<string, array<int, string>> */
    private const ALLOWED_TRANSITIONS = [
        self::STATE_PENDING => [self::STATE_APPROVED, self::STATE_REJECTED, self::STATE_TIMEOUT],
        self::STATE_TIMEOUT => [self::STATE_APPROVED, self::STATE_REJECTED],
        self::STATE_APPROVED => [],
        self::STATE_REJECTED => [],
    ];

    /**
     * Evalúa una transición propuesta sin aplicarla.
     *
     * @return string una de RESULT_VALID / RESULT_IDEMPOTENT / RESULT_INVALID
     */
    public static function evaluate(string $fromState, string $toState): string
    {
        if (!in_array($fromState, self::ALL_STATES, true) || !in_array($toState, self::ALL_STATES, true)) {
            return self::RESULT_INVALID;
        }

        if ($fromState === $toState) {
            return self::RESULT_IDEMPOTENT;
        }

        return in_array($toState, self::ALLOWED_TRANSITIONS[$fromState], true)
            ? self::RESULT_VALID
            : self::RESULT_INVALID;
    }

    public static function isValidState(string $state): bool
    {
        return in_array($state, self::ALL_STATES, true);
    }
}
