# PrestaShop QA — Archivo 3: Cierre y entrega
> Secciones 10 a 12 · Ejecutar al cierre de cada release y al finalizar el proyecto
> Output: Métricas entregables al cliente + Regresión diferencial + Documentación de transferencia

---

> ⚠️ **Recordá siempre pegar la Sección 1 (Contexto del rol) al inicio de cada conversación nueva antes de usar cualquier sección de este archivo.**

---

## Orden de este archivo

```
10 · Métricas y reporting      → reporte de calidad entregable al cliente por sprint/release
11 · Diferencial entre versiones → regresión comparativa entre tags de imagen Docker
12 · README del framework      → documentación de transferencia al cierre del proyecto
```

> La sección 12 se ejecuta una sola vez al cerrar el proyecto. Las secciones 10 y 11 se repiten en cada release.

---

## Sección 10 — Métricas y reporting de calidad
> **Depende de:** Sección 8. **Output:** Dashboard de métricas y reporte de cierre de sprint/release entregable al cliente.

**MÉTRICAS DE EJECUCIÓN:**
- Total de casos ejecutados / pasados / fallados / bloqueados por suite (smoke, regression, API, DB testing, performance)
- Tasa de éxito por módulo: autenticación, catálogo, carrito, checkout, cuenta, back office (catálogo/pedidos/clientes)
- Tiempo de ejecución total y por suite — incluyendo tiempo de arranque + instalación automática del stack Docker
- Flakiness rate: threshold aceptable < 2%

**MÉTRICAS DE DEFECTOS:**
- Total de defectos por severidad: Critical / High / Medium / Low
- Defectos por módulo — identificar módulos con mayor densidad de bugs
- Defectos por técnica de detección: E2E, API testing, DB testing, performance, seguridad, exploratorio
- Defectos reabiertos

**MÉTRICAS DE COBERTURA:**
- Porcentaje de user stories cubiertas por al menos un test automatizado
- Cobertura de técnicas de test design: EP, BVA, State Transition, Decision Tables
- Recursos de la Webservice API con test activo vs total documentado
- Estado del checkpoint de brechas (ver Sección 4.1 en el archivo de Planificación): gaps cerrados vs pendientes, con fecha de última actualización

**MÉTRICAS DE PERFORMANCE (por release):**
- p95 y p99 de response time por endpoint crítico vs SLO definido
- Error rate bajo carga vs threshold aceptable (< 1%)
- Comparativa con release anterior (documentando recursos Docker asignados)

**FORMATO DE ENTREGA AL CLIENTE:**
- Resumen ejecutivo en 1 página: estado general (verde/amarillo/rojo), defectos críticos abiertos, recomendación go/no-go
- Tabla de defectos abiertos con owner y fecha estimada
- Tendencia de calidad: gráfico de defectos por sprint (últimos 3 sprints)
- Próximos pasos

---

## Sección 11 — Testing diferencial entre versiones de PrestaShop
> **Depende de:** Secciones 5 y 4. **Output:** Suite diferencial + bug reports formales con métricas de cierre.

Igual que en un intento anterior con otra plataforma: no hay un ambiente público "with-bugs", así que el equivalente es correr la **misma suite contra dos tags distintos de la imagen Docker** — simulando una regresión de upgrade, un escenario realista en e-commerce.

**Ventaja respecto al intento anterior:** como la instalación es 100% automática vía variables de entorno, generar el segundo ambiente no requiere ningún procedimiento de dump/seed manual — simplemente se cambia `PRESTASHOP_IMAGE_TAG` y se corre `docker compose up` de nuevo.

**SETUP EN PLAYWRIGHT:**
- Parametrizar `PRESTASHOP_IMAGE_TAG` y `BASE_URL` como variables de entorno
- `docker-compose.yml`: perfiles separados (`current` y `candidate`) con distinto tag de imagen
- Ejecutar con: `PRESTASHOP_IMAGE_TAG=8.2 docker compose --profile candidate up -d && npx playwright test --project=candidate`

**Importante — versiones adyacentes:** los dos tags deben ser versiones consecutivas (un minor de diferencia), nunca un salto grande de major, para que el diferencial sea comparable y no se convierta en un proyecto de migración de datos en sí mismo.

**ÁREAS DE MAYOR RIESGO EN UN UPGRADE DE VERSIÓN:**
- Cálculo de totales en carrito y checkout tras cambios en el motor de cart rules
- Comportamiento de módulos instalados tras el upgrade
- Migraciones de esquema de BD
- Permisos y roles del back office
- Compatibilidad del theme del Front Office

**BUG REPORT FORMAT:**
- Título: [MÓDULO] descripción breve del defecto
- Ambiente: tag de imagen Docker afectado
- Severidad: Critical / High / Medium / Low
- Pasos de reproducción (numerados)
- Resultado actual vs resultado esperado
- Evidencia: screenshot + response body Webservice + query SQL si aplica
- Técnica que lo detectó: BVA / EP / State Transition / exploratorio / etc.

**MÉTRICAS A REPORTAR:**
- Tests pasados en versión actual vs versión candidata
- Defectos por módulo y severidad, atribuibles al upgrade
- Cobertura de técnicas de test design aplicadas

---

## Sección 12 — README del framework
> **Depende de:** Framework completo implementado (secciones 5 a 11). **Output:** Documentación de transferencia.

Genera el README.md completo del framework de automatización de PrestaShop. Gracias a la instalación automática, el objetivo de "clonar y correr smoke en menos de 5 minutos" es más alcanzable que en un ambiente que requiere instalación manual.

**1. DESCRIPCIÓN DEL PROYECTO**
- Qué es PrestaShop y cuál es el objetivo del framework
- Stack tecnológico: Playwright, TypeScript, k6, Docker, GitHub Actions, MySQL
- Arquitectura en una línea: POM (Front Office + Back Office) + Factory + Builder + Facade + DDT + DB Testing directo

**2. PREREQUISITOS**
- Node.js >= 18
- Docker Desktop / Docker Engine + Docker Compose
- Variables de entorno requeridas (`.env.example` con todas las keys sin valores)

**3. INSTALACIÓN**
```bash
git clone <repo>
cd prestashop-qa
cp .env.example .env    # completar credenciales de admin/cliente
docker compose up -d    # instala PrestaShop automáticamente, sin wizard
npm install
npx playwright install
```

**4. CÓMO CORRER LOS TESTS**
```bash
# Suite smoke
npx playwright test --grep @smoke

# Suite completa
npx playwright test

# Solo API tests (Webservice)
npx playwright test tests/api/

# Solo back office
npx playwright test tests/admin/

# Diferencial contra versión candidata
PRESTASHOP_IMAGE_TAG=8.2 docker compose --profile candidate up -d
npx playwright test --project=candidate

# Performance con k6
k6 run src/performance/load-test.js
```

**5. ESTRUCTURA DEL PROYECTO**
Explicar cada carpeta de `src/` en 1 línea.

**6. CÓMO AGREGAR UN NUEVO TEST**
Crear Page Object si aplica (Front/Back Office) → crear test data en JSON si aplica → escribir spec usando fixture → agregar tag → verificar que pasa en local antes de hacer PR.

**7. REPORTES**
- HTML report local: `npx playwright show-report`
- Allure report en CI: disponible como artifact en GitHub Actions
- Resultados k6: archivo JSON en `/reports/performance/`

**8. CONVENCIONES**
- Nomenclatura de archivos, clases y métodos
- Tags obligatorios por tipo de test
- Regla de oro: nunca hardcodear datos en specs — todo va en `/test-data/`

**9. TROUBLESHOOTING**
- La instalación automática no completó (BD vacía sin error visible): correr el fallback vía CLI (`docker exec -it prestashop php install-dev/index_cli.php ...`) documentado en `INSTALL.md`
- Webservice devuelve 401: verificar que el permiso del recurso está habilitado para esa API key desde `Advanced Parameters > Webservice`
- Test falla en CI pero pasa en local: verificar `BASE_URL`, revisar `storageState` desactualizado
- Elemento no encontrado por timing en grids del back office: revisar si falta un `waitFor` explícito, nunca `waitForTimeout` fijo
- Datos corruptos entre corridas: al ser la instalación reproducible en minutos, preferir `docker compose down -v && docker compose up -d` para partir de cero antes que depurar un estado inconsistente

**10. CONTACTO Y OWNERSHIP**
- QA responsable, canal de consultas, link al Test Plan en Confluence
