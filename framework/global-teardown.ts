import { FullConfig } from '@playwright/test';

/**
 * Se ejecuta una única vez al final de toda la suite.
 * Punto de extensión para limpieza de datos creados vía Webservice
 * durante la corrida (ej. borrar clientes/órdenes de test), una vez
 * que la Sección 7 (DB Testing) y los helpers de limpieza estén listos.
 * Por ahora no hace nada — placeholder intencional.
 */
export default async function globalTeardown(_config: FullConfig): Promise<void> {
  // TODO: limpieza de datos de test vía WebserviceClient / conexión MySQL directa.
}
