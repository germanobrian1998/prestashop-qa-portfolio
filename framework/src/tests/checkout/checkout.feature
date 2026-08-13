@checkout
Feature: Checkout completo
  Como cliente de la tienda
  Quiero poder completar una compra de principio a fin
  Para adquirir productos exitosamente

  Background:
    Given que la tienda está disponible

  @smoke @checkout
  Scenario: Cliente registrado completa una compra exitosa
    Given un cliente registrado autenticado en el Front Office
    When completa la compra de un producto disponible en el catálogo
    Then la orden se confirma exitosamente
    And ve la página de confirmación con el número de pedido

  @checkout @regression
  Scenario: Cliente intenta checkout sin estar autenticado
    Given ningún cliente autenticado
    When agrega un producto al carrito e intenta iniciar el checkout
    Then el sistema habilita guest checkout o redirige a la página de login

  # NOTA DE ALCANCE (confirmar): el módulo de pago dummy (Sección 5.1) sigue
  # sin reinstalarse, y el método de pago fijado del proyecto es transferencia
  # bancaria / contra reembolso (sin gateway externo) — no hay "datos de pago"
  # en el sentido de número de tarjeta para invalidar. Interpreté este
  # escenario como "llega al paso de pago sin seleccionar ningún método" en
  # vez de depender del módulo dummy. Si preferís que dependa del dummy
  # (para probar rechazo/webhook), avisame y lo reescribo distinto.
  @checkout @regression
  Scenario: Checkout sin seleccionar método de pago muestra un error apropiado
    Given un cliente registrado autenticado en el Front Office
    And un producto agregado al carrito
    When llega hasta el paso de pago sin seleccionar ningún método
    And intenta confirmar la orden de todos modos
    Then el sistema muestra un mensaje de error apropiado
    And no se crea ninguna orden
