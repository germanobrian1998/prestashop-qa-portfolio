import { WebserviceClient } from './WebserviceClient';

/**
 * Wrapper específico sobre el recurso `orders` del Webservice.
 * Usado en precondiciones de tests UI (crear orden previa a un escenario
 * de historial), en Sección 6 (IDOR check contra otro cliente) y en
 * Sección 7 (comparación API vs BD).
 */
export class OrdersApi {
  constructor(private readonly client: WebserviceClient) {}

  async list(filters: Record<string, string> = {}) {
    return this.client.get('orders', { params: { display: 'full', ...filters } });
  }

  async getById(orderId: number) {
    return this.client.get(`orders/${orderId}`, { params: { display: 'full' } });
  }

  async listByCustomer(customerId: number) {
    return this.client.get('orders', {
      params: { 'filter[id_customer]': String(customerId), display: 'full' },
    });
  }

  async create(xmlPayload: string) {
    return this.client.post('orders', xmlPayload);
  }

  async updateStatus(orderId: number, xmlPayload: string) {
    return this.client.put(`orders/${orderId}`, xmlPayload);
  }
}
