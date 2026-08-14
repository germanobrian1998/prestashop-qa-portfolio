import mysql from 'mysql2/promise';

/**
 * Sección 7 — cliente MySQL directo para validación de integridad en
 * capa de BD. Wrapper fino sobre mysql2/promise: conecta vía DATABASE_URL
 * (mismo patrón que WebserviceClient con WEBSERVICE_API_KEY — un solo
 * punto de configuración, sin hardcodear credenciales en los specs).
 */
export class DbClient {
  private constructor(private readonly connection: mysql.Connection) {}

  static async create(databaseUrl: string = process.env.DATABASE_URL ?? ''): Promise<DbClient> {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL no está definida en .env');
    }
    const connection = await mysql.createConnection(databaseUrl);
    return new DbClient(connection);
  }

  /** SELECT que devuelve múltiples filas. */
  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const [rows] = await this.connection.execute(sql, params);
    return rows as T[];
  }

  /** SELECT que espera exactamente una fila (o null si no hay resultado). */
  async queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async dispose(): Promise<void> {
    await this.connection.end();
  }
}
