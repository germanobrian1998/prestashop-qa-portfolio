import { faker } from '@faker-js/faker';

export interface Customer {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

/**
 * Factory Pattern: genera clientes de test con defaults realistas
 * (vía faker) que pueden sobreescribirse parcialmente por test.
 *
 * Ejemplo:
 *   const customer = CustomerFactory.create({ email: 'fijo@test.com' });
 */
export class CustomerFactory {
  static create(overrides: Partial<Customer> = {}): Customer {
    const firstName = overrides.firstName ?? faker.person.firstName();
    const lastName = overrides.lastName ?? faker.person.lastName();

    return {
      firstName,
      lastName,
      email: overrides.email ?? faker.internet.email({ firstName, lastName }).toLowerCase(),
      password: overrides.password ?? `${faker.internet.password({ length: 10 })}1!`,
      ...overrides,
    };
  }

  /** Genera N clientes distintos, útil para tests de data-driven / carga. */
  static createBatch(count: number, overrides: Partial<Customer> = {}): Customer[] {
    return Array.from({ length: count }, () => this.create(overrides));
  }
}
