<?php
/**
 * Módulo de pago dummy para cerrar el gap de confirmación asíncrona
 * (ver Sección 5.1). No procesa pagos reales — simula los 4 estados
 * (pendiente/aprobado/rechazado/timeout) vía un webhook invocado
 * manualmente desde los tests, en vez de depender de credenciales de
 * un gateway real (Stripe/MercadoPago quedan como alternativa opcional
 * de mayor fidelidad, fuera de este alcance).
 */

if (!defined('_PS_VERSION_')) {
    exit;
}

require_once __DIR__ . '/classes/OrderStateTransitionValidator.php';
require_once __DIR__ . '/classes/DummyPaymentStateRegistry.php';
require_once __DIR__ . '/classes/DummyPaymentWebhookAuth.php';

class DummyPayment extends PaymentModule
{
    public function __construct()
    {
        $this->name = 'dummypayment';
        $this->tab = 'payments_gateways';
        $this->version = '1.0.0';
        $this->author = 'PrestaShop QA Portfolio';
        $this->need_instance = 0;
        $this->ps_versions_compliancy = ['min' => '1.7', 'max' => _PS_VERSION_];
        $this->bootstrap = true;

        parent::__construct();

        $this->displayName = $this->l('Dummy Payment (QA)');
        $this->description = $this->l(
            'Módulo de pago simulado para testear confirmación asíncrona, sin gateway real. Solo para entornos de QA.'
        );
        $this->confirmUninstall = $this->l('¿Seguro que querés desinstalar el módulo de pago dummy?');
    }

    /**
     * checkCurrency() NO es un método heredado de PaymentModule en PS 8.1.7
     * — confirmado con error real (`Call to undefined method`) y con
     * `method_exists('DummyPayment', 'checkCurrency')` dando `false`. Cada
     * módulo de pago del core lo implementa por su cuenta (mismo patrón en
     * ps_wirepayment.php / ps_checkpayment.php), usando `getCurrency()`,
     * que sí es un método real de PaymentModule.
     */
    public function checkCurrency($cart)
    {
        $currency_order = new Currency($cart->id_currency);
        $currencies_module = $this->getCurrency($cart->id_currency);
        if (is_array($currencies_module)) {
            foreach ($currencies_module as $currency_module) {
                if ($currency_order->id == $currency_module['id_currency']) {
                    return true;
                }
            }
        }
        return false;
    }

    public function install(): bool
    {
        if (!parent::install()) {
            return false;
        }

        if (!$this->registerHook('paymentOptions')) {
            return false;
        }
        if (!$this->registerHook('displayPaymentReturn')) {
            return false;
        }

        if (!DummyPaymentStateRegistry::install()) {
            return false;
        }

        // Genera el secreto del webhook en el mismo install, para que el
        // módulo quede usable de punta a punta sin un paso manual extra.
        DummyPaymentWebhookAuth::getOrCreateSecret();

        return true;
    }

    public function uninstall(): bool
    {
        // Los 4 OrderState custom NO se borran a propósito: si hay pedidos
        // históricos (de corridas de test previas) referenciando esos
        // id_order_state, borrarlos rompería la FK / el historial de esos
        // pedidos en Back Office. Solo se limpia la configuración propia
        // del módulo (mapeo y secreto), no las entidades de PrestaShop.
        DummyPaymentStateRegistry::uninstallConfig();
        DummyPaymentWebhookAuth::deleteSecret();

        return parent::uninstall();
    }

    /**
     * Hook PS 1.7+/8.x: ofrece el método de pago en el checkout.
     * Devuelve un único PaymentOption que redirige al controller de
     * validación (equivalente al "click en pagar" de un gateway real).
     */
    public function hookPaymentOptions($params): array
    {
        if (!$this->active) {
            return [];
        }
        if (!$this->checkCurrency($params['cart'])) {
            return [];
        }

        $option = new PrestaShop\PrestaShop\Core\Payment\PaymentOption();
        $option->setModuleName($this->name)
            ->setCallToActionText($this->l('Pago simulado (QA) — confirmación asíncrona'))
            ->setAction($this->context->link->getModuleLink($this->name, 'validation', [], true))
            ->setAdditionalInformation(
                $this->l('Este método no procesa pagos reales. El estado se confirma vía webhook desde los tests.')
            );

        return [$option];
    }

    /** Mensaje en la página de confirmación mientras el pedido sigue en "pendiente". */
    public function hookDisplayPaymentReturn($params): string
    {
        return '<p>' . $this->l('Pedido registrado. Esperando confirmación asíncrona del pago.') . '</p>';
    }

    /**
     * Página de configuración del módulo en Back Office. Solo muestra el
     * secreto HMAC del webhook (de solo lectura) para copiarlo una vez a
     * `WEBSERVICE_WEBHOOK_SECRET` en el `.env` del framework de tests —
     * no hay forma de que los tests lo obtengan sin acceso directo a la
     * config de PrestaShop.
     */
    public function getContent(): string
    {
        $secret = DummyPaymentWebhookAuth::getOrCreateSecret();
        $webhookUrl = $this->context->link->getModuleLink($this->name, 'webhook', [], true);

        return '<div class="panel">'
            . '<h3>' . $this->l('Dummy Payment (QA) — Configuración') . '</h3>'
            . '<p>' . $this->l('Copiá este secreto a WEBSERVICE_WEBHOOK_SECRET en el .env del framework de tests. Se genera una sola vez en install().') . '</p>'
            . '<p><strong>' . $this->l('Webhook URL') . ':</strong> <code>' . htmlspecialchars($webhookUrl) . '</code></p>'
            . '<p><strong>' . $this->l('Secreto') . ':</strong> <code>' . htmlspecialchars($secret) . '</code></p>'
            . '</div>';
    }
}
