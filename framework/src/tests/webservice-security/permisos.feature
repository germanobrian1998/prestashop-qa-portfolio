@api @security
Feature: Webservice API Security — permisos limitados
  Como responsable de seguridad de la API
  Quiero que una API key con permisos limitados no pueda operar fuera de su alcance
  Para evitar que una key filtrada u otorgada de más comprometa datos que no debería tocar

  # Usa la key configurada en WEBSERVICE_API_KEY (.env), que se dejó a propósito
  # con permiso de SOLO LECTURA sobre "products" y SIN NINGÚN permiso sobre "orders".

  @smoke @security
  Scenario: API key con permisos limitados intenta una escritura no autorizada
    Given una API key con permiso de solo lectura sobre "products"
    When esa key intenta un POST contra el recurso "products"
    Then el sistema rechaza la operación con un status de error apropiado
    And no expone información sensible en el error

  @security @regression
  Scenario: API key sin ningún permiso intenta leer un recurso fuera de su alcance
    Given una API key sin ningún permiso sobre "orders"
    When esa key intenta un GET contra el recurso "orders"
    Then el sistema rechaza la operación con un status de error apropiado
    And no expone información sensible en el error

  @security @regression
  Scenario: API key con permiso de lectura sobre orders accede a pedidos de otro cliente (IDOR)
    Given una API key con permiso de lectura sobre "orders", sin scope por cliente
    When esa key intenta un GET contra un pedido que no le pertenece
    Then el sistema NO rechaza la operación y expone el pedido ajeno completo
    # HALLAZGO DE SEGURIDAD confirmado con evidencia real en esta sesión
    # (no es el comportamiento deseado): el modelo de permisos del
    # Webservice de PrestaShop opera a nivel de tipo de recurso
    # (orders: GET sí/no), no a nivel de instancia/dueño del recurso.
    # Cualquier key con permiso GET sobre "orders" puede leer el pedido
    # de CUALQUIER cliente, y además el listado sin filtro (GET /api/orders)
    # es enumerable — no hace falta adivinar ids. Ver Sección 11 (P0).
