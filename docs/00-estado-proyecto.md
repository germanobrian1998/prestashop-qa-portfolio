# Estado del proyecto — PrestaShop QA Portfolio
> Generado para retomar en una conversación nueva. Pegar este resumen al
> arrancar, junto con el Archivo 1 (`01-planificacion.md`, que incluye la
> Sección 1) cuando corresponda.

---

## Qué es este proyecto

Tercer proyecto de portfolio de Brian (QA Automation Engineer, UPEX),
sumado a `parabank-qa-portfolio` y `qa-fintech`. Cubre el dominio
e-commerce con **PrestaShop**, self-hosted vía Docker, en la carpeta
`~/prestashop-qa`.

## Historia breve (por qué PrestaShop y no otra cosa)

1. Se evaluó **Toolshop** (practicesoftwaretesting.com) como referencia de
   metodología — de ahí salieron los 3 archivos de prompts (Planificación /
   Implementación / Cierre).
2. Se intentó migrar el proyecto a **nopCommerce**: se resolvió un error de
   instalación (`citext` no existía en Postgres), pero se descubrió que el
   plugin oficial de Web API **cuesta USD $1.400** — no viable para
   portfolio. Se descartó nopCommerce.
3. Se migró a **PrestaShop**: tiene Webservice API **gratis, en el core**
   desde la versión 1.4, y soporta instalación 100% desatendida vía
   variables de entorno (`PS_INSTALL_AUTO=1`), sin wizard manual.

## Los 3 archivos de planificación (ya migrados a PrestaShop)

`01-planificacion.md`, `02-implementacion.md`, `03-cierre-y-entrega.md` —
mismas 12 secciones que el original de Toolshop, adaptadas: MySQL (no
Postgres), Front Office/Back Office (no storefront/admin), Webservice API
con Basic Auth + API key (no JWT), Cart Rules (no descuentos genéricos).

**Todavía no se usaron para generar el Test Plan real** — eso es el
próximo paso grande. Con la infraestructura ya cerrada (ver abajo), el
proyecto está listo para arrancar la Sección 2 (Test Plan) en una
conversación nueva.

## Infraestructura Docker — estado actual (funcionando y verificado)

Carpeta: `~/prestashop-qa`. Archivos: `docker-compose.yml`, `INSTALL.md`, `.env`.

**Decisiones de configuración ya resueltas (no volver a debatir):**
- Puerto **80:80** (no 9000) — el puerto interno y externo deben coincidir
  porque PrestaShop valida el Webservice haciendo una request a su propio
  `PS_DOMAIN` desde adentro del contenedor.
- `PS_DOMAIN=localhost` (sin puerto).
- `PS_DEMO_MODE=0` — **importante:** el modo demo bloquea CUALQUIER acción
  de guardado en el Back Office (mensaje "Esta funcionalidad ha sido
  desactivada"), no es específico del Webservice. Por eso quedó en 0. El
  catálogo de test se crea dinámicamente vía API, no por modo demo.
  (Nota: la Sección 8 del Archivo 2, CI/CD, usa `PS_DEMO_MODE=1` en el job
  de setup de GitHub Actions — es un entorno distinto con otro propósito,
  no contradice esta decisión local.)
- `PS_INSTALL_AUTO=1` — instalación desatendida, sin wizard.
- Carpeta admin: `admin-qa` (no `/admin` por defecto).
- MySQL en puerto 3306 — **si vuelve a chocar con otro contenedor** (ya
  pasó con `orangehrm-db`), cambiar el mapeo en `docker-compose.yml`, no
  el puerto interno.
- Servicio de base de datos en el compose se llama `mysql` (no `db`).
  Usuario `root`, DB `prestashop`, credenciales vía `${DB_PASSWD}` /
  `${DB_NAME}` con default `prestashop` para ambas.

**Comandos útiles:**
```bash
cd ~/prestashop-qa
docker compose up -d              # levantar (rápido si ya existía)
docker compose down -v && docker compose up -d   # reinstalar limpio
docker compose logs -f prestashop # ver progreso de instalación
docker compose ps                 # confirmar "healthy"
docker compose exec mysql mysql -u root -pprestashop prestashop -e "SHOW TABLES;"  # verificación directa de BD
```

**URLs:**
- Front Office: `http://localhost`
- Back Office: `http://localhost/admin-qa`
- Webservice: `http://localhost/api`

## Dónde quedó la sesión (últimos pasos hechos)

✅ Webservice **activado y confirmado**.

✅ **API key generada** desde `Advanced Parameters > Webservice`, con
permisos **GET (Ver) + POST (Añadir)** habilitados sobre: `products`,
`customers`, `orders`, `carts`, `categories`. El resto de los recursos
quedó sin marcar a propósito (para poder testear más adelante el
escenario BDD de la Sección 6 del Archivo 2: key con permisos limitados
que recibe 401/403 al intentar una acción no habilitada).

✅ **Cliente de prueba creado** vía Front Office (`http://localhost` →
registro), separado del admin:
- Email: `qa.customer@prestashop-qa.local`
- Contraseña: `QaTest2026!`
- Verificado como existente en `admin-qa` → Clientes.

✅ **`.env` completo** con las 8 variables:
```bash
BASE_URL=http://localhost
DB_NAME=prestashop
DB_PASSWD=prestashop
PS_LANGUAGE=es
PS_COUNTRY=ar
PS_FOLDER_ADMIN=admin-qa
ADMIN_MAIL=admin@prestashop-qa.local
ADMIN_PASSWD=Admin123!
TEST_CUSTOMER_EMAIL=qa.customer@prestashop-qa.local
TEST_CUSTOMER_PASSWORD=QaTest2026!
WEBSERVICE_API_KEY=8ED36SNNDN363P69QN83MND2L4XS1KUJ
DATABASE_URL=mysql://root:prestashop@localhost:3306/prestashop
```

✅ **Base de datos verificada dos veces:**
1. Contra el `docker-compose.yml` — `DB_NAME`, `DB_PASSWD`, usuario `root`
   y puerto `3306` coinciden exactamente entre `.env` y el compose.
2. Con conexión real: `docker compose exec mysql mysql -u root -pprestashop
   prestashop -e "SHOW TABLES;"` devolvió las tablas `ps_*` esperadas
   (`ps_access`, `ps_address`, `ps_attachment`, etc.) — el esquema está
   instalado correctamente.

✅ **Webservice verificado con curl:**
```bash
curl -u "8ED36SNNDN363P69QN83MND2L4XS1KUJ:" "http://localhost/api/products?output_format=JSON"
```
Respondió con 19 productos del catálogo demo (`{"products":[{"id":1},...]}`) —
confirma que la key funciona con los permisos otorgados.

## ✅ Archivo 1 — CERRADO

Los tres entregables formales fueron generados como documentos `.docx`,
revisados por Brian y aprobados:

- **Test Plan** (`Test_Plan_PrestaShop_QA.docx`) — objetivo, alcance,
  criterios de entrada/salida, riesgos, dependencias, estimación semanal.
- **Estrategia de Testing** (`Estrategia_Testing_PrestaShop_QA.docx`) —
  smoke/regression suites, API testing, DB testing, test isolation,
  estrategia de datos, priorización por riesgo (P0/P1/P2).
- **Test Design** (`Test_Design_PrestaShop_QA.docx`) — técnicas formales
  (EP, BVA, State Transition, Decision Table) + Checkpoint de brechas
  (Sección 6), con el bloqueante de Webservice ya marcado como
  **✅ Resuelto** (permisos GET+POST verificados con curl).

**Revisión de consistencia hecha:** los tres documentos coinciden entre
sí (scope, método de pago fijado, recursos de la Webservice API,
priorización) sin contenido inventado ni contradicciones. Único punto
menor detectado: la Estrategia (Sección 7) menciona `PS_DEMO_MODE=1`
para regenerar catálogo — es correcto (aplica al ambiente de CI, no al
local, que sigue en `PS_DEMO_MODE=0`), pero puede beneficiarse de una
aclaración explícita si el documento se muestra de forma aislada (ej. en
una entrevista). No bloqueante.

## 🔜 Próximo paso inmediato

Abrir conversación nueva, pegar este documento (`00-estado-proyecto.md`)
junto con el Archivo 2 completo (`02-implementacion.md`), y pedir de a
un entregable por vez, empezando por la **Sección 5** (arquitectura del
Framework Playwright). Después de la Sección 5, seguir en este orden:
5.1 (módulo de pago dummy) → 5.2 (mock de ERP) → 6 (BDD + OWASP) → 7 (DB
Testing) → 8 (CI/CD) → 9 (Performance k6).

No pedir todo junto en un solo mensaje. Recordar pegar siempre la
Sección 1 (Contexto del rol) del Archivo 1 al inicio de la conversación
nueva, como indica el propio Archivo 2.

Recién al cerrar el Archivo 2, avanzar con el Archivo 3
(`03-cierre-y-entrega.md`: métricas, diferencial entre versiones,
README de transferencia).

## Notas sueltas para no perder

- El `docker container prune` que se corrió en una sesión anterior borró
  los contenedores de `parabank-qa-portfolio` y `parabank-fresh` (no las
  imágenes). Se recrean con `docker compose up -d` desde esa carpeta, o
  repitiendo el `docker run` original para `parabank-fresh`. No fue
  pérdida de datos real.
- Brian prefiere que Claude le hable de usted (trato formal).
