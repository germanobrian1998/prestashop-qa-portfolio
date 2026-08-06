import { faker } from '@faker-js/faker';

export interface Address {
  address1: string;
  city: string;
  postcode: string;
  /** Nombre visible del país en el selector del formulario, ej. 'Argentina'. */
  country: string;
  /** Provincia/estado — requerido por PrestaShop para países como Argentina. */
  state?: string;
  phone: string;
}

/**
 * Factory Pattern: genera direcciones de test con defaults sobreescribibles.
 * Se modela separada de `Customer` porque así lo trata el dominio real de
 * PrestaShop (`ps_address` es una tabla propia, no un campo de `ps_customer`,
 * y un cliente puede tener más de una) — `OrderBuilder` ya referencia
 * `addressId` como entidad independiente.
 */
export class AddressFactory {
  static create(overrides: Partial<Address> = {}): Address {
    const country = overrides.country ?? 'Argentina';

    return {
      address1: overrides.address1 ?? faker.location.streetAddress(),
      city: overrides.city ?? faker.location.city(),
      // El CPA argentino real es alfanumérico (1 letra + 4 dígitos + 3
      // letras, ej. 'C1000AAA') — un zip numérico genérico de 4 dígitos
      // no pasa la validación client-side del form de dirección y deja
      // el checkout atascado en el paso de Direcciones, sin renderizar
      // los pasos siguientes (envío, pago).
      postcode:
        overrides.postcode ??
        (country === 'Argentina'
          ? `${faker.string.alpha({ length: 1, casing: 'upper' })}${faker.string.numeric(4)}${faker.string.alpha({ length: 3, casing: 'upper' })}`
          : faker.location.zipCode('####')),
      country,
      state: overrides.state ?? 'Buenos Aires',
      phone: overrides.phone ?? faker.phone.number({ style: 'national' }),
      ...overrides,
    };
  }
}
