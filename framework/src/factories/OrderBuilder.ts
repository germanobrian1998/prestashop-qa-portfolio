export interface OrderLineItem {
  productId: number;
  quantity: number;
  unitPrice: number;
}

export interface OrderPayload {
  customerId: number;
  addressId: number;
  paymentMethod: string;
  lines: OrderLineItem[];
  currency: string;
}

/**
 * Builder Pattern: construye payloads de orden paso a paso, útil para
 * armar carritos con múltiples líneas antes de invocar OrdersApi o
 * antes de completar el checkout vía UI con datos precargados.
 *
 * Ejemplo:
 *   const order = new OrderBuilder()
 *     .forCustomer(5)
 *     .withAddress(3)
 *     .withPaymentMethod('bankwire')
 *     .addLine({ productId: 1, quantity: 2, unitPrice: 19.99 })
 *     .addLine({ productId: 4, quantity: 1, unitPrice: 49.5 })
 *     .build();
 */
export class OrderBuilder {
  private customerId?: number;
  private addressId?: number;
  private paymentMethod = 'bankwire';
  private currency = 'ARS';
  private lines: OrderLineItem[] = [];

  forCustomer(customerId: number): this {
    this.customerId = customerId;
    return this;
  }

  withAddress(addressId: number): this {
    this.addressId = addressId;
    return this;
  }

  withPaymentMethod(paymentMethod: string): this {
    this.paymentMethod = paymentMethod;
    return this;
  }

  withCurrency(currency: string): this {
    this.currency = currency;
    return this;
  }

  addLine(line: OrderLineItem): this {
    this.lines.push(line);
    return this;
  }

  /** Total esperado según las líneas cargadas — útil para asserts en Sección 7 (DB Testing). */
  getExpectedTotal(): number {
    return this.lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  }

  build(): OrderPayload {
    if (!this.customerId) throw new Error('OrderBuilder: falta forCustomer()');
    if (!this.addressId) throw new Error('OrderBuilder: falta withAddress()');
    if (this.lines.length === 0) throw new Error('OrderBuilder: falta al menos un addLine()');

    return {
      customerId: this.customerId,
      addressId: this.addressId,
      paymentMethod: this.paymentMethod,
      currency: this.currency,
      lines: [...this.lines],
    };
  }
}
