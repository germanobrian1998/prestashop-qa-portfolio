<?php
/**
 * Firma y verifica payloads del webhook con HMAC-SHA256, usando un secreto
 * generado en install() y guardado en Configuration. No es una integración
 * real de gateway — es lo mínimo para que el webhook no sea un endpoint
 * abierto que cualquiera pueda golpear para mover el estado de pedidos
 * ajenos, y para que los tests tengan que "conocer" el secreto igual que
 * conocería una API key de gateway real.
 */
class DummyPaymentWebhookAuth
{
    private const CONFIG_KEY = 'DUMMYPAYMENT_WEBHOOK_SECRET';

    public static function getOrCreateSecret(): string
    {
        $secret = Configuration::get(self::CONFIG_KEY);
        if (empty($secret)) {
            $secret = bin2hex(random_bytes(32));
            Configuration::updateValue(self::CONFIG_KEY, $secret);
        }

        return $secret;
    }

    public static function deleteSecret(): void
    {
        Configuration::deleteByName(self::CONFIG_KEY);
    }

    /**
     * Firma determinística sobre `orderReference|targetStatus` — mismo
     * criterio que debe reproducir quien invoca el webhook (los tests).
     */
    public static function sign(string $orderReference, string $targetStatus, string $secret): string
    {
        return hash_hmac('sha256', $orderReference . '|' . $targetStatus, $secret);
    }

    public static function verify(string $orderReference, string $targetStatus, string $providedSignature): bool
    {
        $expected = self::sign($orderReference, $targetStatus, self::getOrCreateSecret());

        // hash_equals evita timing attacks al comparar la firma.
        return hash_equals($expected, $providedSignature);
    }
}
