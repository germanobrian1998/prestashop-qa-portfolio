@api @security
Feature: Webservice API Security — inyección SQL en filtros

  # Usa la misma key configurada en WEBSERVICE_API_KEY (.env), que tiene
  # permiso de lectura sobre "products" — necesario para que el payload
  # llegue hasta la capa de query, y no se corte antes por falta de permiso
  # (que sería el caso si probáramos esto contra "orders" con esta key).

  @security @regression
  Scenario: Payload de inyección SQL en un filtro de búsqueda del Webservice
    Given una API key con permiso de lectura sobre "products"
    When esa key hace un GET con un payload de inyección SQL en el filtro "name"
    Then el sistema responde de forma controlada, sin exponer detalles internos
