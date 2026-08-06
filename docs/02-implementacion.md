# PrestaShop QA — Archivo 2: Implementación
> Secciones 5 a 9 (incluye 5.1 y 5.2, cierre de gaps) · Ejecutar sprint a sprint
> Output: Framework + BDD + DB Testing + CI/CD + Performance

---

> ⚠️ **Recordá siempre pegar la Sección 1 (Contexto del rol) al inicio de cada conversación nueva antes de usar cualquier sección de este archivo.**

---

## Orden de este archivo

```
5 · Framework Playwright     → arquitectura e implementación del framework
5.1 · Módulo de pago dummy   → cierre de gap: pagos asíncronos/webhooks (ver Sección 4.1 en Planificación)
5.2 · Mock de ERP            → cierre de gap: sincronización de stock/precios (ver Sección 4.1 en Planificación)
6 · BDD + OWASP              → escenarios Gherkin + checks de seguridad
7 · SQL / DB Testing         → validación de integridad directa en MySQL
8 · CI/CD GitHub Actions     → pipeline con instalación 100% automatizada
9 · Performance k6           → validación bajo carga con SLOs
```

> Cada sección toma el output de la anterior. No saltar pasos. Las Secciones 5.1 y 5.2 son opcionales para el smoke/regression core, pero requeridas para cerrar los gaps del checkpoint (Sección 4.1) antes de considerar el framework completo.

---

## Sección 5 — Framework Playwright + TypeScript
> **Depende de:** Sección 4. **Output:** Scaffold completo del framework con arquitectura lista para implementar.
> ⚠️ **Gap bloqueante activo (ver Sección 4.1 en el archivo de Planificación):** la activación del Webservice en Back Office está pendiente. El scaffold de `pages/`, `factories/`, `facades/` puede avanzar en paralelo, pero `api/WebserviceClient.ts` y todo lo que dependa de la API (Secciones 6, 7, 8) queda bloqueado hasta resolverlo.

Genera un framework de automatización E2E con Playwright + TypeScript para PrestaShop aplicando buenas prácticas de arquitectura.

**PRINCIPIOS SOLID:**
- Single Responsibility: cada Page Object encapsula únicamente su propia página. Los helpers de API son clases independientes de los tests y de las Page Objects.
- Open/Closed: `BasePage` con métodos comunes (waitForElement, navigate, getValidationError) que todas las páginas extienden.
- Dependency Inversion: los tests reciben Page Objects vía fixtures de Playwright, nunca las instancian con `new`.

**PATRONES DE DISEÑO:**
- Page Object Model (POM): separar explícitamente **Front Office** y **Back Office** — `LoginPage`, `RegisterPage`, `HomePage`, `ProductPage`, `CartPage`, `CheckoutAddressPage`, `CheckoutPaymentPage`, `CheckoutConfirmationPage`, `AccountPage`; y del lado back office: `AdminLoginPage`, `AdminProductListPage`, `AdminOrderListPage`, `AdminCustomerListPage`.
- Factory Pattern: `CustomerFactory` y `ProductFactory` para generar test data con defaults sobreescribibles.
- Builder Pattern: `OrderBuilder` para construir payloads de orden con múltiples line items.
- Facade Pattern: `CheckoutFacade` que encapsula los pasos del checkout en `completePurchase(customer, product, paymentData)`.

**DATA DRIVEN TESTING:**
- Datos externalizados en `/test-data/`: `customers.json`, `products.json`, `payment-methods.json`, `search-terms.json`.
- `@playwright/test` parametrize para iterar sobre datasets.
- Nunca hardcodear datos de prueba en las specs.

**ESTRUCTURA DE CARPETAS:**
```
src/
├── pages/
│   ├── BasePage.ts
│   ├── frontoffice/
│   │   ├── LoginPage.ts
│   │   ├── CartPage.ts
│   │   └── CheckoutPage.ts
│   └── backoffice/
│       ├── AdminLoginPage.ts
│       └── AdminProductListPage.ts
├── factories/
│   ├── CustomerFactory.ts
│   └── OrderBuilder.ts
├── facades/
│   └── CheckoutFacade.ts
├── api/
│   ├── WebserviceClient.ts   ← cliente base con Basic Auth (API key)
│   ├── ProductsApi.ts
│   └── OrdersApi.ts
├── fixtures/
│   └── index.ts
├── test-data/
│   ├── customers.json
│   ├── products.json
│   └── payment-methods.json
└── tests/
    ├── auth/
    ├── cart/
    ├── checkout/
    ├── admin/
    └── api/
```

**ESTRATEGIA DE LOCATORS:**
1. `getByRole` — primera opción siempre
2. `getByTestId` — cuando no hay rol semántico
3. `getByLabel` / `getByPlaceholder` — para inputs de formulario, muy presentes en el back office
4. `getByText` — solo para texto estático
5. Nunca usar: XPath, CSS con clases generadas dinámicamente por el theme, ni nth-child frágiles

**MANEJO DE AUTENTICACIÓN — storageState:**
Dos sesiones separadas (Front Office y Back Office) que nunca deben mezclarse:
- `global-setup.ts`: login vía UI una vez, guarda `playwright/.auth/customer.json` y `playwright/.auth/admin.json`
- `playwright.config.ts`: `storageState` por proyecto
- Los tests de autenticación (`@auth`) hacen login propiamente
- Los tests que necesitan sesión limpia crean su propio contexto sin `storageState`

**CLIENTE DE WEBSERVICE — más simple que el patrón cookie/JWT de un intento anterior:**
La Webservice API usa **Basic Auth** con la API key como usuario y contraseña vacía. `WebserviceClient.ts` centraliza esto:
```typescript
const auth = Buffer.from(`${apiKey}:`).toString('base64');
// Header: Authorization: Basic ${auth}
```
No hay tokens que expirar ni refrescar — la API key es estable hasta que se revoca desde el back office.

**MANEJO DE ERRORES Y REINTENTOS:**
- `retries: 1` en CI, `retries: 0` en local
- Flakiness rate aceptable: < 2%
- Timeouts explícitos: `actionTimeout: 10000`, `navigationTimeout: 30000`
- `trace: 'on-first-retry'`, screenshot y video automáticos en fallo

**CONFIGURACIÓN:**
- `playwright.config.ts` con proyectos: `frontoffice`, `backoffice`, `api`, `mobile`
- Variables de entorno vía `.env`: `BASE_URL`, `PRESTASHOP_IMAGE_TAG`, `ADMIN_MAIL`, `ADMIN_PASSWD`, `TEST_CUSTOMER_EMAIL`, `TEST_CUSTOMER_PASSWORD`, `WEBSERVICE_API_KEY`, `DATABASE_URL`
- Método de pago de test fijado: transferencia bancaria / contra reembolso — sin gateway externo
- Tags: `@smoke`, `@regression`, `@auth`, `@cart`, `@checkout`, `@admin`, `@api`, `@security`
- Reporter: HTML nativo de Playwright + Allure para CI
- API helpers para precondiciones vía Webservice antes de tests UI
- `globalSetup` y `globalTeardown` para autenticación y limpieza de datos entre suites

---

## Sección 5.1 — Módulo de pago dummy (cierre de gap)
> **Depende de:** Sección 5, Webservice activo. **Output:** Módulo de pago simulado + suite de tests sobre webhooks y estados de pago.

**Motivo:** el método de pago fijado (transferencia bancaria, ver Sección 2 — OUT OF SCOPE del archivo de Planificación) no permite testear confirmación asíncrona ni escenarios de fallo. Este módulo cierra ese gap sin depender de credenciales de un gateway real.

**Alcance:**
- Módulo de pago propio (PHP, siguiendo la estructura estándar de módulos de PrestaShop) con estados simulables: `pendiente → aprobado → rechazado → timeout`
- Endpoint local que actúa como webhook de confirmación asíncrona, invocado manualmente desde los tests para simular la llamada del "gateway"
- Escenarios a cubrir: confirmación exitosa, rechazo, timeout sin respuesta, doble confirmación (idempotencia), confirmación fuera de orden (llega después de que el cliente ya abandonó el checkout)
- Alternativa de mayor fidelidad (opcional, plus): sandbox real de Stripe o MercadoPago con tarjetas de test, en vez del módulo dummy

**Test design:** aplicar State Transition (igual criterio que Sección 4) sobre los cuatro estados del pago, incluyendo transiciones inválidas (ej. `rechazado → aprobado` sin intervención manual no debería ser posible).

---

## Sección 5.2 — Mock de ERP (cierre de gap)
> **Depende de:** Sección 5, Webservice activo. **Output:** Mock server + suite de tests de resiliencia ante integración externa.

**Motivo:** PrestaShop no incluye ERP nativo. Sin este mock no hay forma de testear sincronización de stock/precios ni el comportamiento del sistema ante fallos de un servicio externo — un caso de uso frecuente en clientes reales de consultora (ver comparación B2C/B2B).

**Alcance:**
- Mock server en Express + TypeScript (reutiliza el mismo stack del framework) que expone endpoints simulando lo que entregaría un ERP: stock por SKU, lista de precios, confirmación de pedido
- Sincronización con PrestaShop vía Webservice API (polling programado o llamada directa desde un script de test)
- Escenarios a cubrir: stock desactualizado (el mock devuelve un valor distinto al de PrestaShop), timeout del mock (simula ERP caído), respuesta con datos inconsistentes (precio negativo, SKU inexistente), reconciliación tras reestablecer la conexión

**Test design:** casos de resiliencia — qué hace el sistema cuando la fuente externa falla, no solo cuando responde correctamente. Documentar cada caso con el mismo formato de bug report de la Sección 11 (archivo de Cierre y entrega) si se detectan defectos.

---

## Sección 6 — BDD con Cucumber + validación OWASP
> **Depende de:** Sección 5. **Output:** Feature files Gherkin con step definitions y checks de seguridad.

**FEATURE: Checkout completo**
- Scenario: cliente registrado completa compra exitosa
- Scenario: cliente intenta checkout sin estar autenticado → habilita guest checkout o redirige a login según configuración
- Scenario: checkout con datos de pago inválidos muestra mensaje de error apropiado

**FEATURE: Autenticación**
- Scenario: login exitoso con credenciales válidas (Front Office)
- Scenario: login fallido con contraseña incorrecta → mensaje genérico
- Scenario: brute force — intentos fallidos consecutivos → verificar rate limiting o bloqueo
- Scenario: acceso al Back Office con sesión de cliente (no admin) → debe rechazar el acceso

**FEATURE: Webservice API Security checks**
- Scenario: API key con permisos limitados (solo lectura de `products`) intenta un POST → debe retornar 401/403
- Scenario: request a `orders` de un cliente sin permiso sobre ese recurso → debe rechazar (IDOR check)
- Scenario: payload con intento de SQL injection en un filtro de búsqueda del Webservice → debe retornar error controlado, sin stack trace expuesto

Mapear cada escenario a criterios de aceptación y tags: `@smoke`, `@security`, `@regression`.

---

## Sección 7 — SQL / DB Testing layer (real, contra MySQL)
> **Depende de:** Sección 5. **Output:** Suite de validación de integridad en tres layers (UI · API · BD).

**ESCENARIOS DE VALIDACIÓN:**

Flujo de registro:
- Registro vía UI/API → verificar en `ps_customer` que el registro existe con campos correctos y password hasheado
- Validar que no se crean registros duplicados para el mismo email

Flujo de orden:
- Checkout completo → validar en `ps_orders` y `ps_order_detail` que `total_paid` coincide con la suma de `(unit_price × quantity)` por línea, más envío e impuestos
- Validar que `ps_stock_available.quantity` se decrementa correctamente tras confirmar la orden
- Verificar que el `current_state` inicial del pedido corresponde a "Awaiting payment" en BD inmediatamente después del checkout

Flujo de carrito:
- Agregar productos distintos → validar en `ps_cart_product` que cantidades coinciden con lo mostrado en UI
- Verificar que un carrito abandonado persiste asociado al `id_customer`/`id_guest` y se recupera al re-loguear

**APPROACH:**
- Cliente MySQL (ej. `mysql2` en Node) desde helpers de Playwright para queries de verificación
- Documentar discrepancias con evidencia de tres layers: screenshot UI + response body Webservice + resultado de query SQL
- Clasificar defectos de integridad como P0 si afectan valores monetarios o stock

---

## Sección 8 — CI/CD con GitHub Actions + Docker
> **Depende de:** Secciones 5, 6 y 7. **Output:** Archivo `.github/workflows/qa.yml` listo para usar.

Gracias a la instalación 100% automatizada, el setup del pipeline es más simple que en un ambiente que requiere instalación manual previa:

- TRIGGER: push a main/develop y pull requests
- LINT + TYPECHECK JOB: primer gate — `tsc --noEmit` y `eslint src/`
- **SETUP JOB:** `docker compose up -d` con `PS_INSTALL_AUTO=1` + `PS_DEMO_MODE=1` en las variables de entorno — la instancia queda instalada y con catálogo de ejemplo cargado en minutos, sin ningún paso manual previo; esperar el healthcheck real (request contra el Front Office, no solo el contenedor "Up"); generar la API key del Webservice vía script (ver Sección 5) o dejarla preconfigurada con datos fijos si el flujo lo permite
- SMOKE JOB (depende de setup): `@smoke` tests con Playwright en Docker
- REGRESSION JOB (depende de smoke): suite completa en paralelo (sharding de Playwright)
- API JOB: colección de Postman con Newman contra la Webservice API
- DB TESTING JOB: tests que consultan MySQL directamente
- PERFORMANCE JOB (solo en merge a main): k6, falla si se rompen los thresholds

Configuración requerida:
- Secrets: `ADMIN_MAIL`, `ADMIN_PASSWD`, `TEST_CUSTOMER_EMAIL`, `TEST_CUSTOMER_PASSWORD`, `WEBSERVICE_API_KEY`, `DATABASE_URL`
- Artifact upload de reportes HTML de Playwright y resultados k6
- Notificación de fallo vía comment en PR con resumen de resultados

---

## Sección 9 — Performance Testing con k6
> **Depende de:** Sección 8. **Output:** Scripts k6 con thresholds integrados al pipeline de CI.

**SLOs objetivo:**
- p95 response time < 500ms para listado de catálogo (Front Office y Webservice `GET /api/products`)
- p99 response time < 1000ms para creación de orden
- Error rate < 1% bajo carga sostenida

**Escenarios a implementar:**
1. LOAD TEST — usuarios concurrentes simulando: login → búsqueda → add to cart → checkout
2. STRESS TEST — rampa progresiva para identificar el punto de ruptura del endpoint de creación de órdenes
3. SPIKE TEST — pico repentino sobre el listado de catálogo

Endpoints prioritarios: login, catálogo con filtros, carrito, creación de orden, Webservice `GET /api/products` y `GET /api/orders`.

Incluir threshold checks, métricas de `http_req_duration` por endpoint, y exportar resultados a JSON. Documentar CPU/RAM asignados al contenedor en cada corrida para que las comparaciones entre releases sean válidas.
