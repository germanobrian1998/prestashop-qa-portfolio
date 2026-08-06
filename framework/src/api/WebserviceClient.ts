import { APIRequestContext, request } from '@playwright/test';

export type OutputFormat = 'JSON' | 'XML';

export interface WebserviceRequestOptions {
  /** Query params adicionales, ej. { filter: '[name]=%25shirt%25', display: 'full' } */
  params?: Record<string, string>;
  outputFormat?: OutputFormat;
}

/**
 * Cliente base para la Webservice API de PrestaShop (incluida en el core
 * desde 1.4, gratuita — ver estado del proyecto). Autenticación: Basic Auth
 * con la API key como usuario y contraseña vacía.
 *
 * A diferencia de un esquema cookie/JWT, no hay tokens que expiren ni haya
 * que refrescar: la key es estable hasta que se revoca desde
 * `Advanced Parameters > Webservice` en el Back Office.
 *
 * Uso típico (precondiciones de tests UI, o Sección 6 API security checks):
 *   const client = await WebserviceClient.create();
 *   const res = await client.get('products', { params: { display: 'full' } });
 */
export class WebserviceClient {
  private constructor(
    private readonly context: APIRequestContext,
    private readonly apiKey: string
  ) {}

  static async create(
    apiKey: string = process.env.WEBSERVICE_API_KEY ?? '',
    // Barra final obligatoria: Playwright resuelve paths relativos contra
    // baseURL con las reglas estándar de URL — un path que arranca con '/'
    // se toma como absoluto respecto al origen y descarta '/api'. Ver
    // buildPath(), que en consecuencia no debe emitir barra inicial.
    baseURL: string = `${process.env.BASE_URL ?? 'http://localhost'}/api/`
  ): Promise<WebserviceClient> {
    if (!apiKey) {
      throw new Error(
        'WEBSERVICE_API_KEY no está definida. Revisar .env (ver Sección de Webservice en el estado del proyecto).'
      );
    }

    const context = await request.newContext({
      baseURL,
      extraHTTPHeaders: {
        Authorization: `Basic ${WebserviceClient.encodeBasicAuth(apiKey)}`,
      },
    });

    return new WebserviceClient(context, apiKey);
  }

  private static encodeBasicAuth(apiKey: string): string {
    return Buffer.from(`${apiKey}:`).toString('base64');
  }

  /** GET a un recurso del Webservice, ej. 'products', 'orders/5'. */
  async get(resource: string, options: WebserviceRequestOptions = {}) {
    const response = await this.context.get(this.buildPath(resource, options));
    return { status: response.status(), body: await this.parseBody(response, options.outputFormat) };
  }

  /** POST — creación de un recurso (ej. customers, orders vía XML). */
  async post(resource: string, xmlBody: string, options: WebserviceRequestOptions = {}) {
    const response = await this.context.post(this.buildPath(resource, options), {
      data: xmlBody,
      headers: { 'Content-Type': 'text/xml' },
    });
    return { status: response.status(), body: await this.parseBody(response, options.outputFormat) };
  }

  /** PUT — actualización de un recurso existente. */
  async put(resource: string, xmlBody: string, options: WebserviceRequestOptions = {}) {
    const response = await this.context.put(this.buildPath(resource, options), {
      data: xmlBody,
      headers: { 'Content-Type': 'text/xml' },
    });
    return { status: response.status(), body: await this.parseBody(response, options.outputFormat) };
  }

  /** DELETE de un recurso. */
  async delete(resource: string, options: WebserviceRequestOptions = {}) {
    const response = await this.context.delete(this.buildPath(resource, options));
    return { status: response.status() };
  }

  private buildPath(resource: string, options: WebserviceRequestOptions): string {
    const query = new URLSearchParams({
      output_format: options.outputFormat ?? 'JSON',
      ...(options.params ?? {}),
    });
    return `${resource}?${query.toString()}`;
  }

  private async parseBody(response: Awaited<ReturnType<APIRequestContext['get']>>, outputFormat?: OutputFormat) {
    if ((outputFormat ?? 'JSON') === 'JSON') {
      try {
        return await response.json();
      } catch {
        return await response.text();
      }
    }
    return response.text();
  }

  async dispose(): Promise<void> {
    await this.context.dispose();
  }
}
