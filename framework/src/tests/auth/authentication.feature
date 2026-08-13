@auth
Feature: Autenticación de clientes
  Como cliente registrado de la tienda
  Quiero poder autenticarme de forma segura en el Front Office
  Para acceder a mi cuenta y no comprometer cuentas ajenas

  Background:
    Given que la tienda está disponible

  @smoke @auth
  Scenario: Login exitoso con credenciales válidas
    Given un cliente registrado con credenciales válidas
    When el cliente inicia sesión con esas credenciales en el Front Office
    Then el sistema le concede acceso
    And la página de "Mi cuenta" muestra su información

  @security @regression @auth
  Scenario: Login fallido con contraseña incorrecta
    Given un cliente registrado con email válido
    When el cliente intenta iniciar sesión con una contraseña incorrecta
    Then el sistema rechaza el acceso
    And el mensaje de error es genérico y no revela si el email existe en el sistema

  # ASUNCIÓN SIN VALIDAR: no confirmé si PrestaShop core aplica rate limiting o
  # bloqueo de cuenta por intentos fallidos en el login de Front Office out-of-the-box.
  # El escenario está escrito para verificar el comportamiento real, sea cual sea.
  # Si no hay ninguna protección, ESO ES EL HALLAZGO (documentar como bug/gap,
  # no ajustar el test para que "pase").
  @security @regression @auth
  Scenario Outline: Intentos fallidos consecutivos (brute force)
    Given un cliente registrado con email válido
    When el cliente intenta iniciar sesión con contraseña incorrecta <intentos> veces consecutivas
    Then el sistema debería aplicar alguna forma de rate limiting o bloqueo temporal
    And documentar el comportamiento real observado si no lo hay

    Examples:
      | intentos |
      | 5        |
      | 10       |

  @security @regression @auth
  Scenario: Acceso al Back Office con sesión de cliente (no admin)
    Given un cliente autenticado únicamente en el Front Office
    When intenta acceder directamente a una URL del Back Office
    Then el sistema rechaza el acceso
    And no expone ningún contenido ni menú administrativo
