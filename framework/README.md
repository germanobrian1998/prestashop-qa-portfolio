# PrestaShop QA — Framework Playwright + TypeScript

Framework E2E + API para el portfolio de PrestaShop QA. Corresponde a la
**Sección 5** del Archivo 2 (Implementación).

## Requisitos previos

- Instancia de PrestaShop corriendo (`~/prestashop-qa`, ver `INSTALL.md` de esa carpeta).
- Node.js 20+
- `.env` completo (copiar de `.env.example`) con `WEBSERVICE_API_KEY` real —
  el Webservice ya está activo y verificado con curl.

## Instalación

```bash
npm install
npx playwright install --with-deps chromium
cp .env.example .env   # completar con los valores reales
```

## Correr los tests

```bash
npm test                    # toda la suite
npm run test:smoke          # solo @smoke
npm run test:frontoffice    # proyecto frontoffice (con sesión de cliente)
npm run test:frontoffice-auth # proyecto frontoffice-auth (sin sesión — login/registro)
npm run test:backoffice     # proyecto backoffice
npm run test:api            # proyecto api (Webservice)
npm run test:ui             # modo UI interactivo de Playwright
npm run report               # abrir último reporte HTML
```

## Estructura

```
src/
├── pages/            # Page Object Model — BasePage + Front Office + Back Office
├── factories/        # CustomerFactory, ProductFactory, OrderBuilder
├── facades/          # CheckoutFacade
├── api/              # WebserviceClient (Basic Auth) + ProductsApi + OrdersApi
├── fixtures/         # Inyección de Page Objects/facades/API en los tests
├── test-data/        # Datasets para data-driven testing
└── tests/            # Specs organizados por dominio (auth, cart, checkout, admin, api)
```

## Notas de arquitectura

- **Dos sesiones separadas** (Front Office / Back Office) vía `storageState`,
  generadas una única vez en `global-setup.ts`. Nunca se mezclan.
- **`src/tests/auth/` corre en su propio proyecto** (`frontoffice-auth`),
  sin `storageState`: los tests de login/registro necesitan arrancar
  deslogueados, así que no pueden heredar la sesión de cliente que sí
  usan `cart/` y `checkout/` dentro del proyecto `frontoffice`.
- **WebserviceClient** usa Basic Auth (API key como usuario, password vacía) —
  no hay tokens que expiren. Ver `src/api/WebserviceClient.ts`.
- **Locators**: `getByRole` > `getByTestId` > `getByLabel`/`getByPlaceholder` >
  `getByText`. Nunca XPath ni clases CSS generadas por el theme.
- **Método de pago de test:** transferencia bancaria / contra reembolso, sin
  gateway externo (ver `CheckoutPaymentPage.ts`). El módulo de pago dummy para
  testear estados asíncronos se agrega en la Sección 5.1 (pendiente).

## Pendiente (fuera del alcance de esta entrega)

- Sección 5.1 — módulo de pago dummy (estados pendiente/aprobado/rechazado/timeout)
- Sección 5.2 — mock de ERP
- Sección 6 — BDD (Cucumber) + checks OWASP
- Sección 7 — DB Testing layer contra MySQL
- Sección 8 — CI/CD GitHub Actions
- Sección 9 — Performance k6
