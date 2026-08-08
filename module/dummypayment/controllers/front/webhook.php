<?php
/**
 * Endpoint invocado manualmente por los tests (no por un gateway real) para
 * simular la llamada de confirmación asíncrona. POST JSON:
 *   { "orderReference": "ABCDEFGHI", "targetStatus": "approved", "signature": "<hmac>" }
 *
 * `signature` = HMAC-SHA256("orderReference|targetStatus", secreto del módulo)
 * — ver DummyPaymentWebhookAuth::sign(), que los tests deben reproducir
 * (el secreto se obtiene vía Configuration en un fixture de setup, no se
 * hardcodea en los tests).
 *
 * Respuestas:
 *   200 { success: true,  previousStatus, currentStatus, idempotent: bool }
 *   401 { success: false, error: 'invalid_signature' }
 *   404 { success: false, error: 'order_not_found' }
 *   409 { success: false, error: 'invalid_transition', currentStatus }
 *   422 { success: false, error: 'invalid_payload' }
 */

require_once dirname(__FILE__, 3) . '/classes/OrderStateTransitionValidator.php';
require_once dirname(__FILE__, 3) . '/classes/DummyPaymentStateRegistry.php';
require_once dirname(__FILE__, 3) . '/classes/DummyPaymentWebhookAuth.php';

class DummyPaymentWebhookModuleFrontController extends ModuleFrontController
{
    // Sin $ssl = true a propósito: la instancia local de este proyecto no
    // tiene HTTPS configurado (BASE_URL=http://localhost, sin certificado
    // — ver estado del proyecto). Forzar SSL acá redirigiría a un https://
    // que no existe en este entorno. Si el módulo se despliega alguna vez
    // en un ambiente con HTTPS real, vale la pena reconsiderar esto.

    public function initContent(): void
    {
        // No hay vista — este controller solo responde JSON.
    }

    public function postProcess(): void
    {
        header('Content-Type: application/json; charset=utf-8');

        $rawBody = Tools::file_get_contents('php://input');
        $payload = json_decode((string) $rawBody, true);

        if (!is_array($payload)
            || empty($payload['orderReference'])
            || empty($payload['targetStatus'])
            || empty($payload['signature'])
            || !is_string($payload['orderReference'])
            || !is_string($payload['targetStatus'])
            || !is_string($payload['signature'])
        ) {
            $this->respond(422, ['success' => false, 'error' => 'invalid_payload']);
            return;
        }

        $orderReference = $payload['orderReference'];
        $targetStatus = $payload['targetStatus'];
        $signature = $payload['signature'];

        if (!OrderStateTransitionValidator::isValidState($targetStatus)) {
            $this->respond(422, ['success' => false, 'error' => 'invalid_payload']);
            return;
        }

        if (!DummyPaymentWebhookAuth::verify($orderReference, $targetStatus, $signature)) {
            $this->respond(401, ['success' => false, 'error' => 'invalid_signature']);
            return;
        }

        // Order::getIdByReference() no existe en el core de PrestaShop —
        // confirmado con error real contra PS 8.1.7. Consulta directa a
        // `orders` por `reference`, mismo patrón que usa el propio core
        // (evita depender de una API de colección que varía entre versiones).
        $orderId = (int) Db::getInstance()->getValue(
            'SELECT `id_order` FROM `' . _DB_PREFIX_ . 'orders` WHERE `reference` = \'' . pSQL($orderReference) . '\''
        );
        $order = $orderId > 0 ? new Order($orderId) : null;

        if (!$order || !Validate::isLoadedObject($order)) {
            $this->respond(404, ['success' => false, 'error' => 'order_not_found']);
            return;
        }

        $currentStateKey = DummyPaymentStateRegistry::getStateKeyFromOrderStateId((int) $order->current_state);
        if ($currentStateKey === null) {
            // El pedido existe pero no es uno originado por este módulo
            // (no está en ninguno de los 4 estados custom) — no tocarlo.
            $this->respond(409, ['success' => false, 'error' => 'invalid_transition', 'currentStatus' => null]);
            return;
        }

        $evaluation = OrderStateTransitionValidator::evaluate($currentStateKey, $targetStatus);

        if ($evaluation === OrderStateTransitionValidator::RESULT_INVALID) {
            $this->respond(409, [
                'success' => false,
                'error' => 'invalid_transition',
                'currentStatus' => $currentStateKey,
            ]);
            return;
        }

        if ($evaluation === OrderStateTransitionValidator::RESULT_IDEMPOTENT) {
            // Doble confirmación: no se aplica ningún efecto secundario de
            // nuevo (no se reenvía email, no se re-loguea el cambio) — se
            // responde 200 igual, éxito idempotente.
            $this->respond(200, [
                'success' => true,
                'previousStatus' => $currentStateKey,
                'currentStatus' => $currentStateKey,
                'idempotent' => true,
            ]);
            return;
        }

        $targetStateId = DummyPaymentStateRegistry::getOrderStateId($targetStatus);
        if (!$targetStateId) {
            $this->respond(500, ['success' => false, 'error' => 'state_not_configured']);
            return;
        }

        $orderHistory = new OrderHistory();
        $orderHistory->id_order = (int) $order->id;
        $orderHistory->changeIdOrderState($targetStateId, $order, true);
        $orderHistory->addWithemail(true);

        $this->respond(200, [
            'success' => true,
            'previousStatus' => $currentStateKey,
            'currentStatus' => $targetStatus,
            'idempotent' => false,
        ]);
    }

    /** @param array<string, mixed> $body */
    private function respond(int $httpStatus, array $body): void
    {
        http_response_code($httpStatus);
        echo json_encode($body);
        exit;
    }
}
