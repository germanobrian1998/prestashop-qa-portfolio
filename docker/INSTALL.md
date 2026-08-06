# INSTALL.md — Instalación de PrestaShop (automática)

A diferencia de un intento anterior con otra plataforma, acá **no hay wizard
manual ni dump de base de datos que generar**. La instalación es 100%
desatendida vía variables de entorno.

## 1. Completar el `.env`

Copiar `.env.example` a `.env` y completar `ADMIN_MAIL` y `ADMIN_PASSWD`
(las credenciales de administrador que va a usar todo el proyecto).

## 2. Levantar el stack

```bash
docker compose up -d
```

La primera vez tarda unos minutos: MySQL arranca, PrestaShop se instala
automáticamente (con catálogo de ejemplo por `PS_DEMO_MODE=1`), y recién
después el healthcheck empieza a pasar.

## 3. Verificar que terminó de instalar

```bash
docker compose ps
```

Espere a que `prestashop_app` figure `healthy`. Si tarda más de 5 minutos,
revise los logs:

```bash
docker compose logs -f prestashop
```

## 4. Acceder

- **Front Office (tienda):** `http://localhost:9000`
- **Back Office (admin):** `http://localhost:9000/admin-qa` (la carpeta se
  fijó en `PS_FOLDER_ADMIN` dentro del `docker-compose.yml` — evitar dejarla
  como `/admin` por defecto, es una convención de seguridad básica)

Ingrese al Back Office con el `ADMIN_MAIL` / `ADMIN_PASSWD` que puso en `.env`.

## 5. Habilitar el Webservice y generar la API key

1. En el Back Office, ir a **Advanced Parameters > Webservice**.
2. Activar "Enable PrestaShop's webservice".
3. Click en "Add new webservice key".
4. Generar la key (o escribir una propia), darle una descripción, y en la
   tabla de permisos habilitar los recursos que va a testear (`products`,
   `customers`, `orders`, `carts`, `categories`) con los métodos HTTP
   correspondientes (GET/POST/PUT/DELETE).
5. Guardar la key en `.env` como `WEBSERVICE_API_KEY`.

## 6. Verificar que la Webservice responde

```bash
curl -u "TU_API_KEY_ACA:" "http://localhost:9000/api/products?output_format=JSON"
```

Si devuelve JSON con productos, el Webservice está funcionando.

---

## Fallback — si `PS_INSTALL_AUTO` no completa la instalación

En algunas configuraciones la instalación automática puede quedar con la
base de datos vacía sin mostrar un error visible. Si el healthcheck nunca
pasa, forzar la instalación vía CLI dentro del contenedor:

```bash
docker exec -it prestashop_app php install-dev/index_cli.php \
  --domain="localhost:9000" \
  --db_server=mysql \
  --db_name="prestashop" \
  --db_user=root \
  --db_password="prestashop" \
  --prefix="ps_" \
  --email="admin@prestashop-qa.local" \
  --password="TU_PASSWORD" \
  --language=es \
  --country=ar \
  --newsletter=0 \
  --send_email=0
```

## Notas

- Como la instalación es reproducible en minutos, **no hace falta un dump
  de seed**: para partir de cero, alcanza con `docker compose down -v &&
  docker compose up -d`.
- Para el diferencial de la Sección 11 del Archivo 3 (comparar versiones),
  simplemente cambie `PRESTASHOP_IMAGE_TAG` en `.env` y vuelva a levantar
  el stack — no hay que repetir ningún procedimiento manual.
- Nunca commitear `.env` con credenciales reales — solo `.env.example`.
