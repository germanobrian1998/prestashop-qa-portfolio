<?php
/**
 * Equivalente al "click en pagar" de un gateway real: valida el carrito
 * actual y crea el pedido en el estado custom "pendiente". No hay
 * redirección a un gateway externo — el pedido queda esperando la
 * confirmación asíncrona que los tests disparan vía webhook.php.
 */

require_once dirname(__FILE__, 3) . '/classes/OrderStateTransitionValidator.php';
require_once dirname(__FILE__, 3) . '/classes/DummyPaymentStateRegistry.php';

class DummyPaymentValidationModuleFrontController extends ModuleFrontController
{
    public function postProcess(): void
    {
        $cart = $this->context->cart;

        if ($cart->id_customer == 0 || $cart->id_address_delivery == 0 || $cart->id_address_invoice == 0 || !$this->module->active) {
            Tools::redirect('index.php?controller=order&step=1');
            return;
        }

        $authorized = false;
        foreach (Module::getPaymentModules() as $moduleInfo) {
            if ($moduleInfo['name'] === 'dummypayment') {
                $authorized = true;
                break;
            }
        }
        if (!$authorized) {
            PrestaShopLogger::addLog('DummyPayment: intento de acceso sin autorización', 3, null, 'Cart', (int) $cart->id, true);
            die($this->module->l('Este método de pago no está disponible.', 'validation'));
        }

        $customer = new Customer($cart->id_customer);
        if (!Validate::isLoadedObject($customer)) {
            Tools::redirect('index.php?controller=order&step=1');
            return;
        }

        $pendingStateId = DummyPaymentStateRegistry::getOrderStateId(OrderStateTransitionValidator::STATE_PENDING);
        if (!$pendingStateId) {
            die($this->module->l('El módulo no está instalado correctamente (falta el estado "pendiente").', 'validation'));
        }

        $this->module->validateOrder(
            (int) $cart->id,
            $pendingStateId,
            (float) $cart->getOrderTotal(true, Cart::BOTH),
            $this->module->displayName,
            null,
            [],
            (int) $cart->id_currency,
            false,
            $customer->secure_key
        );

        Tools::redirect('index.php?controller=order-confirmation&id_cart=' . (int) $cart->id
            . '&id_module=' . (int) $this->module->id
            . '&id_order=' . (int) $this->module->currentOrder
            . '&key=' . $customer->secure_key);
    }
}
