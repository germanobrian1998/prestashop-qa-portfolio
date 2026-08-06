# PrestaShop QA — Archivo 1: Planificación
> Secciones 1 a 4.1 · Usar antes de escribir una línea de código
> Output: Test Plan + Estrategia + Casos de prueba formales acordados con el cliente + Checkpoint de brechas

---

> ⚠️ **La Sección 1 (Contexto del rol) va al inicio de CADA conversación nueva**, independientemente del archivo que estés usando.

---

## Orden de este archivo

```
1 · Contexto del rol        → ancla de toda conversación nueva
2 · Test Plan formal        → entregable al cliente antes de arrancar
3 · Estrategia de testing   → qué, por qué y cómo se testea
4 · Test Design Techniques  → diseño formal de casos por módulo
4.1 · Checkpoint de brechas → estado de gaps vs. lo implementado — se repite en cada checkpoint del proyecto, no es estático
```

---

## Sección 1 — Contexto del rol
> **Uso:** Pegá esta sección al inicio de cada conversación nueva. Es la base de todas las demás.

Eres un QA Automation Engineer con 4+ años de experiencia en equipos Agile. Tu stack principal es Playwright + TypeScript, k6, Docker, GitHub Actions y Postman. Has trabajado en dominios de e-commerce, validando flujos de compra, carrito, pagos y gestión de inventario.

El SUT (System Under Test) es **PrestaShop**, una plataforma de e-commerce PHP open source ampliamente usada en producción, especialmente en Europa y Latinoamérica. La instancia corre **100% self-hosted vía Docker en tu propia máquina**, con MySQL como motor de base de datos — lo que da acceso directo a la BD para validación de integridad.

**Instalación totalmente desatendida (a diferencia de un intento previo con otra plataforma):** la imagen Docker oficial de PrestaShop soporta instalación 100% automática vía variables de entorno (`PS_INSTALL_AUTO=1` + credenciales de admin + datos de conexión a MySQL) — no requiere pasar por ningún wizard manual. Esto significa que **no hace falta ningún procedimiento de seed/dump manual**: cada `docker compose up` levanta una instancia ya instalada, de forma reproducible, tanto en local como en CI.

La instancia expone dos superficies:
- **Front Office** (tienda pública) y **Back Office / admin** (gestión de catálogo, pedidos, clientes, cart rules/promociones, módulos) — ambos servidos por la misma aplicación PHP.
- **Webservice API**: REST API **incluida en el núcleo desde PrestaShop 1.4** (no es un plugin ni tiene costo adicional), autenticada con Basic Auth vía una API key generada desde `Advanced Parameters > Webservice` en el back office. Documentación oficial y gratuita en `devdocs.prestashop-project.org`.

**Versión fijada:** se pinnea un tag concreto de la imagen Docker (nunca `latest`) para garantizar reproducibilidad. Documentar el tag exacto en `.env` (`PRESTASHOP_IMAGE_TAG`).

Credenciales de prueba: se definen directamente como variables de entorno (`ADMIN_MAIL`, `ADMIN_PASSWD`) antes de levantar el contenedor — no hay que generarlas a mano durante un wizard. Documentarlas en `.env` / `test-data/users.json`, nunca hardcodearlas en specs.

---

## Sección 2 — Test Plan formal
> **Depende de:** Sección 1. **Output:** Documento formal entregable al cliente antes de arrancar el proyecto.

Redacta un Test Plan formal para el proyecto de QA Automation de PrestaShop. El documento debe cubrir:

**1. OBJETIVO**
Definir el alcance, enfoque y criterios de calidad para la estrategia de testing de PrestaShop, garantizando cobertura de los flujos críticos de negocio antes de cada release, sobre una instancia self-hosted con control total del ambiente.

**2. SCOPE (en alcance)**
- Flujos E2E: autenticación, catálogo, carrito, checkout, cuenta, wishlist, comparación de productos, formulario de contacto
- Back Office: gestión de catálogo (productos, categorías, atributos/combinaciones), gestión de pedidos, gestión de clientes, cart rules (cupones/promociones)
- Webservice API (REST, core, Basic Auth con API key): contratos, status codes, permisos por recurso
- DB Testing directo: integridad de datos entre UI, API y MySQL
- Performance: endpoints críticos bajo carga (login, catálogo, checkout, Webservice API)
- Seguridad: OWASP Top 10 aplicado a autenticación, control de acceso Front/Back Office, y a la Webservice API
- Ambientes: instancia local propia vía Docker Compose (MySQL + PrestaShop), instalación 100% automatizada

**3. OUT OF SCOPE**
- Testing de infraestructura de hosting productivo
- Testing de módulos/temas de terceros no incluidos en la instalación base
- Compatibilidad con browsers legacy (IE11)
- Accesibilidad (WCAG) — puede incorporarse en una fase posterior
- Integraciones reales de pasarelas de pago: se testea únicamente con el módulo bundlado de **pago por transferencia bancaria / contra reembolso** (sin gateway externo), para mantener el checkout determinístico y offline
- **Multi-store** (PrestaShop soporta múltiples tiendas desde un mismo panel): queda fuera de esta fase por la complejidad de setup adicional (aislamiento de datos entre tiendas). Candidato a Fase 2.
- Módulos de marketplace/multi-vendor de terceros (no son parte del core)

**4. CRITERIOS DE ENTRADA**
- Instancia Docker levantada y estable (PrestaShop + MySQL), instalación automática verificada
- Webservice habilitado y API key generada con permisos definidos
- Credenciales de admin y de cliente de prueba documentadas
- User stories con criterios de aceptación definidos

**5. CRITERIOS DE SALIDA**
- 100% de casos P0 ejecutados y aprobados
- 0 defectos Critical o High abiertos sin resolución
- Suite smoke pasando en CI/CD sobre el ambiente Dockerizado
- Reporte de métricas entregado al cliente

**6. RIESGOS Y MITIGACIONES**
- Riesgo: la instalación automática vía variables de entorno puede fallar silenciosamente en algunas configuraciones (base de datos vacía sin error visible) → Mitigación: healthcheck explícito que valide contra un endpoint real del Front Office antes de dar por buena la instalación, y fallback documentado vía script CLI de instalación (`install-dev/index_cli.php`) si el automático no completa
- Riesgo: datos de prueba corruptos entre ejecuciones (catálogo, stock, pedidos) → Mitigación: al ser la instalación reproducible en minutos, cada corrida de CI puede partir de una instancia 100% fresca en vez de depender de reseed
- Riesgo: flakiness en tests E2E por operaciones AJAX del back office (grids, validaciones) → Mitigación: locators semánticos + auto-wait de Playwright, nunca `waitForTimeout` fijo
- Riesgo: la Webservice API tiene menor cobertura de métodos que un framework REST diseñado desde cero (no cubre toda lógica de negocio, solo CRUD sobre modelos) → Mitigación: documentar explícitamente qué lógica de negocio (ej. cálculo de cart rules) requiere validarse vía UI o DB directamente, no vía API

**7. DEPENDENCIAS**
- Docker Desktop / Docker Engine + Docker Compose
- Imagen oficial `prestashop/prestashop` + `mysql`
- Webservice habilitado (viene en el core, solo requiere activarlo y generar API key)

**8. ESTIMACIÓN**
- Semana 1: levantar ambiente Docker + habilitar Webservice + Test Plan + Estrategia + Test Design
- Semana 2-3: implementación del framework E2E + API
- Semana 4: DB Testing + Seguridad + BDD
- Semana 5: CI/CD + Performance
- Semana 6: Métricas + diferencial entre versiones + README + entrega

---

## Sección 3 — Estrategia de testing
> **Depende de:** Sección 2. **Output:** Plan de testing con prioridades P0/P1/P2 acordado con el cliente.

Aplicando Shift-Left y Risk-Based Testing, define una estrategia completa para PrestaShop que cubra:

**1. SMOKE SUITE** — flujos críticos de negocio: login (front office y back office), búsqueda de producto, add to cart, checkout completo (dirección + método de envío + pago), registro de usuario, creación de un producto básico desde el back office.

**2. REGRESSION SUITE** — cobertura de módulos: autenticación (login/registro/logout), catálogo (búsqueda, filtros por categoría/atributo, sorting), carrito (agregar, editar cantidad, eliminar, persistencia), checkout (dirección, métodos de envío, métodos de pago, confirmación), cuenta (direcciones, historial de pedidos, wishlist), back office (gestión de catálogo, gestión de pedidos, gestión de clientes, cart rules).

**3. API TESTING (Webservice)** — validar los recursos REST expuestos: `products`, `customers`, `orders`, `carts`, `categories` — autenticación Basic Auth con API key, permisos por recurso y método HTTP, status codes y estructura de respuesta (XML por defecto, JSON con `?output_format=JSON`).

**4. DB TESTING (habilitado por el ambiente self-hosted)** — validación directa contra MySQL: consistencia de `ps_orders`, `ps_order_detail`, `ps_product`, `ps_customer` entre UI, API y BD.

**5. TEST ISOLATION** — cada test debe ser completamente independiente:
- No depender del orden de ejecución ni del estado dejado por otro test
- Poder correr de forma aislada o en paralelo sin efectos secundarios
- Setup vía API/Admin antes del test y teardown después
- Nunca asumir stock disponible fijo, un cliente ya existente, o un pedido previo

**Decisión de estrategia de datos (tomada, no pendiente):** dado que la instalación es 100% reproducible en minutos vía `PS_DEMO_MODE=1` + `PS_INSTALL_AUTO=1`, el enfoque es más simple que en un ambiente donde la instalación es manual:
- El **catálogo base** puede regenerarse desde cero en cada corrida de CI (no hace falta un dump persistente) usando el modo demo, que carga productos/categorías de ejemplo automáticamente.
- Las **entidades transaccionales** (clientes, carritos, órdenes) se crean y destruyen dinámicamente por test vía Webservice/Admin, igual al patrón ya usado en `parabank-qa-portfolio`.
- Método de pago de test fijado: **transferencia bancaria / contra reembolso** (bundlado, sin gateway externo).

Prioriza por riesgo:
- P0: flujos de pago y autenticación — impacto directo en revenue y seguridad
- P1: catálogo, carrito y back office de gestión de pedidos — impacto en conversión y operación
- P2: wishlist, comparación de productos, contacto — impacto en experiencia, no en transacción

---

## Sección 4 — Test Design Techniques aplicadas al SUT
> **Depende de:** Sección 3. **Output:** Casos de prueba formales con técnica justificada por módulo.

Aplica técnicas formales de test design a los módulos de PrestaShop para generar una suite sólida y justificada.

**EQUIVALENCE PARTITIONING — campo de búsqueda de catálogo:**
- Partición válida: término existente que matchea uno o varios productos
- Partición válida: término parcial (búsqueda por substring)
- Partición inválida: cadena vacía → comportamiento definido (todos los productos o "sin resultados")
- Partición inválida: intento de inyección (`<script>`, `'; DROP TABLE`) → debe sanitizar sin romper la consulta
- Partición inválida: string de 500+ caracteres → validar límite de longitud

**BOUNDARY VALUE ANALYSIS — cantidad de producto en carrito, considerando la cantidad disponible y el comportamiento "out of stock" configurable por producto (denegar / permitir con aviso / permitir sin límite):**
- Valor límite inferior: 0 → no permitido
- Mínimo válido: 1 → agregado correctamente
- Valor nominal: 5
- Máximo válido: stock disponible del producto
- Límite superior + 1: stock + 1 → debe respetar la configuración de comportamiento "out of stock" del producto

**STATE TRANSITION — ciclo de vida de un pedido en PrestaShop (los "order states" son configurables, pero el flujo default es):**

Awaiting check/bank wire payment → Payment accepted → Processing in progress → Shipped → Delivered
Cualquier estado → Canceled / Refunded / Payment error (según reglas configuradas)

- Validar combinaciones inválidas: no se puede marcar "Delivered" si el pago nunca fue aceptado
- Cancelar un pedido desde el back office y validar que el stock se restituye (según configuración de "restock" del estado)
- Reembolsar solo permitido si el pago ya fue capturado

**DECISION TABLE — reglas de descuento vía Cart Rules (PrestaShop soporta reglas por porcentaje, monto fijo, envío gratis, y condiciones combinadas):**

Condiciones: cliente registrado (sí/no) × código de cart rule válido (sí/no) × total del carrito > umbral de envío gratis (sí/no) × restricción de "un uso por cliente" (sí/no)
→ Mapear las combinaciones a precio final esperado y validar en Front Office + Webservice response

Documentar cada caso con: inputs, resultado esperado, técnica aplicada y prioridad.

---

## Sección 4.1 — Checkpoint de brechas (gaps) del proyecto
> **Depende de:** Secciones 1 a 4. **Output:** Estado actualizado de brechas entre lo planificado y lo implementado, con roadmap de cierre. Se actualiza en cada checkpoint, no es un documento estático.

**Bloqueante actual:**

| Gap | Descripción | Prioridad |
|---|---|---|
| Webservice API | Activación en Back Office sin resolver — bloquea Postman/Newman, DB Testing cruzado con API, y cualquier test que dependa de la Sección 6 (Webservice Security checks) | 🔴 Alta — resolver antes de continuar con Sección 5 en adelante |

**Gaps funcionales (fuera de lo cubierto por Secciones 2-4):**

| Gap | Descripción | Solución propuesta | Prioridad |
|---|---|---|---|
| Pagos reales / webhooks asíncronos | El método fijado (transferencia bancaria, ver Sección 2 — OUT OF SCOPE) no permite testear confirmación asíncrona, reintentos ni fallos de pago | Módulo de pago "dummy" custom (estados: pendiente → aprobado → rechazado) + webhook simulado local. Alternativa más fiel: sandbox Stripe/MercadoPago — ver Sección 5.1 en el archivo de Implementación | 🟡 Media-alta |
| Integración con ERP | PrestaShop no trae ERP nativo; sin esto no hay testing de sincronización de stock/precios ni resiliencia ante fallos de un sistema externo | Mock server en Express + TypeScript exponiendo stock/precios/confirmación de pedido, sincronizado vía Webservice API — ver Sección 5.2 en el archivo de Implementación | 🟡 Media-alta |
| Testing de performance (este proyecto) | La Sección 9 (k6) está diseñada pero no ejecutada aún | Ejecutar una vez resuelto el bloqueante de Webservice | 🟢 Plus — ya hay precedente en parabank-qa-portfolio |
| Accesibilidad | No está en scope (ver Sección 3 — OUT OF SCOPE), sin cobertura axe-core en este proyecto | Evaluar incorporación en fase posterior | 🟢 Plus — ya hay precedente en parabank-qa-portfolio |

**Gaps de scope (decisiones conscientes, no pendientes):**

| Ítem | Estado | Nota |
|---|---|---|
| Multi-store | Fuera de scope (Fase 2) | Ya documentado en Sección 2 — OUT OF SCOPE |
| Modo B2B nativo de PrestaShop | Fuera de scope (Fase 3, futuro) | Evaluar recién tras cerrar los gaps funcionales de B2C |
| Marketplace multi-vendor | Fuera de scope permanente | No representativo del cliente típico de consultora; no es parte del core |

**Roadmap de cierre (orden de resolución):**

1. Resolver activación de Webservice (bloqueante — habilita Secciones 6, 7 y 8)
2. Módulo de pago dummy con escenarios de fallo y webhook simulado (Sección 5.1)
3. Mock de ERP en Express/TypeScript (Sección 5.2 — stock, precios, confirmación de pedido)
4. Ejecutar Postman/Newman (Sección 8) sobre el Webservice ya activo
5. *(Plus opcional)* Ejecutar k6 (Sección 9)
6. *(Plus opcional)* Incorporar axe-core
7. Recién después: evaluar Fase 3 (B2B nativo) o proyecto separado (Odoo) para cubrir modelo B2B

**Nota de narrativa (para entrevistas o presentación al cliente):** la brecha de pagos/ERP no se presenta como vacío de conocimiento, sino como decisión consciente de scope para poder enfocar el testing en lógica de negocio (checkout, descuentos, stock) sin depender de credenciales externas. Una vez resueltos los puntos 2 y 3 de este roadmap, la brecha queda cerrada y la narrativa deja de ser necesaria.

**Gaps conocidos, no resueltos por decisión de scope (fuera del roadmap de cierre):**

| Gap | Motivo de no incluirlo |
|---|---|
| Testing de emails transaccionales (confirmación de pedido, recuperación de contraseña) | No contemplado en ningún archivo del framework; se documenta como brecha conocida en vez de asumir cobertura implícita |
| Compatibilidad cross-browser | Sección 3 (OUT OF SCOPE) excluye explícitamente browsers legacy (IE11), pero tampoco existe una matrix de testing definida para el resto de browsers modernos — se deja como decisión de scope, no como olvido |
