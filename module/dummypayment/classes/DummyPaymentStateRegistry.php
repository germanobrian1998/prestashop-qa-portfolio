<?php
/**
 * Traduce entre los 4 estados simulados del módulo
 * (OrderStateTransitionValidator::STATE_*) y los `id_order_state` reales
 * de PrestaShop (`ps_order_state`), creados en DummyPayment::install().
 *
 * Se crean 4 estados custom propios en vez de reutilizar los estados
 * estándar de PrestaShop (ej. "Payment accepted", "Payment error") a
 * propósito: así el pedido queda inequívocamente identificado como
 * originado por este módulo de test, sin pisar ni confundirse con
 * estados que también usan otros módulos de pago (incluida la
 * transferencia bancaria, método fijado para el resto de la suite).
 */
class DummyPaymentStateRegistry
{
    private const CONFIG_PREFIX = 'DUMMYPAYMENT_STATE_';

    /** @var array<string, array{name: string, color: string, logable: bool, paid: bool}> */
    private const STATE_DEFINITIONS = [
        OrderStateTransitionValidator::STATE_PENDING => [
            'name' => 'Dummy payment: pendiente',
            'color' => '#4169E1',
            'logable' => false,
            'paid' => false,
        ],
        OrderStateTransitionValidator::STATE_APPROVED => [
            'name' => 'Dummy payment: aprobado',
            'color' => '#32CD32',
            'logable' => true,
            'paid' => true,
        ],
        OrderStateTransitionValidator::STATE_REJECTED => [
            'name' => 'Dummy payment: rechazado',
            'color' => '#DC143C',
            'logable' => true,
            'paid' => false,
        ],
        OrderStateTransitionValidator::STATE_TIMEOUT => [
            'name' => 'Dummy payment: timeout',
            'color' => '#FF8C00',
            'logable' => false,
            'paid' => false,
        ],
    ];

    /** Crea los 4 OrderState custom si no existen todavía y persiste sus ids. Llamado desde install(). */
    public static function install(): bool
    {
        foreach (self::STATE_DEFINITIONS as $stateKey => $definition) {
            if (Configuration::get(self::configKey($stateKey))) {
                continue; // ya instalado en una corrida previa
            }

            $orderState = new OrderState();
            $orderState->name = array_fill_keys(
                Language::getIDs(false),
                $definition['name']
            );
            $orderState->color = $definition['color'];
            $orderState->logable = $definition['logable'];
            $orderState->paid = $definition['paid'];
            $orderState->invoice = false;
            $orderState->send_email = false;

            if (!$orderState->add()) {
                return false;
            }

            Configuration::updateValue(self::configKey($stateKey), (int) $orderState->id);
        }

        return true;
    }

    /** Elimina la configuración de mapeo (no borra los OrderState en sí — ver nota en uninstall del módulo). */
    public static function uninstallConfig(): void
    {
        foreach (array_keys(self::STATE_DEFINITIONS) as $stateKey) {
            Configuration::deleteByName(self::configKey($stateKey));
        }
    }

    public static function getOrderStateId(string $stateKey): ?int
    {
        if (!OrderStateTransitionValidator::isValidState($stateKey)) {
            return null;
        }

        $id = (int) Configuration::get(self::configKey($stateKey));
        return $id > 0 ? $id : null;
    }

    /** Traduce un id_order_state real de vuelta a la clave simulada, o null si no es uno de los 4 nuestros. */
    public static function getStateKeyFromOrderStateId(int $idOrderState): ?string
    {
        foreach (array_keys(self::STATE_DEFINITIONS) as $stateKey) {
            if (self::getOrderStateId($stateKey) === $idOrderState) {
                return $stateKey;
            }
        }

        return null;
    }

    private static function configKey(string $stateKey): string
    {
        return self::CONFIG_PREFIX . strtoupper($stateKey);
    }
}
