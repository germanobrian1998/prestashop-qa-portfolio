import { faker } from '@faker-js/faker';

export interface Product {
  name: string;
  reference: string;
  price: number;
  quantity: number;
  active: boolean;
}

/**
 * Factory Pattern: genera productos de test para precondiciones vía
 * Webservice (ProductsApi) antes de tests de UI, o para poblar
 * `test-data/products.json`.
 */
export class ProductFactory {
  static create(overrides: Partial<Product> = {}): Product {
    return {
      name: overrides.name ?? faker.commerce.productName(),
      reference: overrides.reference ?? `QA-${faker.string.alphanumeric(8).toUpperCase()}`,
      price: overrides.price ?? Number(faker.commerce.price({ min: 5, max: 500 })),
      quantity: overrides.quantity ?? faker.number.int({ min: 1, max: 100 }),
      active: overrides.active ?? true,
      ...overrides,
    };
  }

  static createBatch(count: number, overrides: Partial<Product> = {}): Product[] {
    return Array.from({ length: count }, () => this.create(overrides));
  }
}
