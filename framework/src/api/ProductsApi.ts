import { WebserviceClient } from './WebserviceClient';

/**
 * Wrapper específico sobre el recurso `products` del Webservice.
 * Mantiene a los tests / facades desacoplados del formato crudo
 * de query params y XML que exige la API.
 */
export class ProductsApi {
  constructor(private readonly client: WebserviceClient) {}

  async list(filters: Record<string, string> = {}) {
    return this.client.get('products', { params: { display: 'full', ...filters } });
  }

  async getById(productId: number) {
    return this.client.get(`products/${productId}`, { params: { display: 'full' } });
  }

  /** Búsqueda por nombre — usada también en el escenario de SQL injection de la Sección 6. */
  async searchByName(name: string) {
    return this.client.get('products', {
      params: { 'filter[name]': `%[${name}]%`, display: 'full' },
    });
  }

  async create(xmlPayload: string) {
    return this.client.post('products', xmlPayload);
  }

  async updateStock(productId: number, xmlPayload: string) {
    return this.client.put(`stock_availables/${productId}`, xmlPayload);
  }

  async delete(productId: number) {
    return this.client.delete(`products/${productId}`);
  }
}
