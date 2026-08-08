# Dummy Payment (QA)

Módulo de pago simulado para PrestaShop, generado para la **Sección 5.1** del
proyecto PrestaShop QA Portfolio. Cierra el gap de confirmación asíncrona que
el método de pago fijado para el resto de la suite (transferencia bancaria)
no permite testear: no hay ningún webhook real de por medio con transferencia
bancaria, así que no se puede probar rechazo, timeout, doble confirmación ni
confirmación fuera de orden sin un módulo propio.

⚠️ **No verificado todavía contra una instancia real.** A diferencia del
framework Playwright de la Sección 5 (validado en ~15 rondas de fixes reales
contra Docker), este módulo no pasó por ese mismo proceso — instalalo y
seguí el mismo criterio iterativo si algo no funciona como se espera acá.

## Instalación

1. Copiar la carpeta `dummypayment/` dentro de `~/prestashop-qa/modules/`
   (bind-mount o `docker cp` según cómo esté montado tu compose).
2. Back Office → Módulos → buscar "Dummy Payment (QA)" → Instalar.
3. Back Office → Módulos → Dummy Payment (QA) → Configurar. Copiar el
   **Secreto** que se muestra ahí a `WEBSERVICE_WEBHOOK_SECRET` en el `.env`
   del framework Playwright (`prestashop-qa-framework/.env`). Se genera una
   sola vez en `install()` — si reinstalás el módulo, cambia.
4. Confirmar que el checkout ofrece "Pago simulado (QA) — confirmación
   asíncrona" como método de pago disponible junto a transferencia
   bancaria/contra reembolso.

No requiere gateway externo ni credenciales de terceros.

## Estados y transiciones

4 estados simulados, modelados como `OrderState` propios del módulo (no se
reutilizan los nativos de PrestaShop, para que el pedido quede
inequívocamente identificado como originado por este módulo de test):

| Estado | `paid` | `logable` | Significado |
|---|---|---|---|
| `pending` | no | no | Pedido creado, esperando confirmación del "gateway" |
| `approved` | sí | sí | Pago confirmado |
| `rejected` | no | sí | Pago rechazado |
| `timeout` | no | no | El gateway no respondió a tiempo |

Transiciones válidas (`OrderStateTransitionValidator::ALLOWED_TRANSITIONS`,
con test unitario en `tests/OrderStateTransitionValidatorTest.php`, 16/16 en
verde):

| Desde ↓ / Hacia → | pending | approved | rejected | timeout |
|---|---|---|---|---|
| **pending** | idempotente | ✅ | ✅ | ✅ |
| **approved** | ❌ | idempotente | ❌ | ❌ |
| **rejected** | ❌ | ❌ **(bloqueado a propósito)** | idempotente | ❌ |
| **timeout** | ❌ | ✅ (confirmación tardía) | ✅ (confirmación tardía) | idempotente |

- `rejected → approved` está bloqueado explícitamente: un rechazo no puede
  revertirse solo, requiere intervención manual desde Back Office.
- `timeout → approved/rejected` sí está permitido: modela una confirmación
  del gateway que llega tarde (el cliente ya abandonó el checkout), no un
  error — es distinto del caso anterior.
- Cualquier transición a sí mismo es idempotente (mismo código 200, sin
  reenviar email ni duplicar el registro en el historial) — cubre el
  escenario de doble confirmación del gateway.

Correr el test de la matriz en aislamiento (no requiere PrestaShop ni Docker):

```bash
php tests/OrderStateTransitionValidatorTest.php
```

## Endpoint del webhook

`POST /module/dummypayment/webhook` (o `index.php?fc=module&module=dummypayment&controller=webhook`)

Body JSON:
```json
{
  "orderReference": "QDVMYGBDY",
  "targetStatus": "approved",
  "signature": "<hmac-sha256>"
}
```

`signature = HMAC-SHA256("orderReference|targetStatus", secreto del módulo)`
— ver `DummyPaymentWebhookAuth::sign()`. El secreto nunca se hardcodea en los
tests: se lee de `WEBSERVICE_WEBHOOK_SECRET` en runtime.

Respuestas:
| HTTP | Cuerpo | Caso |
|---|---|---|
| 200 | `{success:true, previousStatus, currentStatus, idempotent:false}` | Transición válida aplicada |
| 200 | `{success:true, previousStatus, currentStatus, idempotent:true}` | Doble confirmación (mismo estado) |
| 401 | `{success:false, error:'invalid_signature'}` | Firma HMAC incorrecta |
| 404 | `{success:false, error:'order_not_found'}` | La referencia no corresponde a ningún pedido |
| 409 | `{success:false, error:'invalid_transition', currentStatus}` | Transición no permitida (ej. `rejected→approved`) |
| 422 | `{success:false, error:'invalid_payload'}` | Body faltante o `targetStatus` no es uno de los 4 estados |

### Ejemplos con curl (reemplazar `SECRET` por el valor real de `WEBSERVICE_WEBHOOK_SECRET`)

```bash
# Confirmación exitosa (pending → approved)
REF="QDVMYGBDY"
SECRET="pegar-secreto-real-aca"
SIG=$(printf "%s|%s" "$REF" "approved" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')
curl -X POST http://localhost/module/dummypayment/webhook \
  -H "Content-Type: application/json" \
  -d "{\"orderReference\":\"$REF\",\"targetStatus\":\"approved\",\"signature\":\"$SIG\"}"

# Transición inválida (ej. ya aprobado, intentar rechazar) → 409
SIG=$(printf "%s|%s" "$REF" "rejected" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')
curl -X POST http://localhost/module/dummypayment/webhook \
  -H "Content-Type: application/json" \
  -d "{\"orderReference\":\"$REF\",\"targetStatus\":\"rejected\",\"signature\":\"$SIG\"}"
```

## Qué falta verificar contra la instancia real

- El nombre del hook `paymentReturn`/`displayPaymentReturn` puede variar
  según la versión exacta de PS 8.1.x — si el mensaje "Esperando
  confirmación asíncrona" no aparece en la confirmación, confirmar el
  nombre real del hook con `ps_hook` en la base o con un módulo de ejemplo.
- La URL real del webhook (friendly URL vs. `index.php?fc=module&...`) —
  documentado acá con la forma `index.php?fc=module` por ser la más
  universal, pero conviene confirmarla con el mismo proceso que usamos para
  el resto del framework.
- El texto exacto de `setCallToActionText()` tal como lo renderiza el theme
  en el radio del checkout, para que el Page Object de Playwright
  (`CheckoutPaymentPage.selectDummyGateway()`) lo matchee.
