// Interfaz mínima de base de datos para las herramientas, las barandillas y el turno de Lucía.
//
// Se arma sobre cualquier cliente que tenga `query(sql, valores) → { rows }` (node-postgres en
// los tests y en el worker). Así una herramienta corre igual en producción y adentro de una
// transacción de prueba que termina en rollback (hito 1.4, control 5: lo que escribe se
// verifica contra la base real y no deja nada).
//
// Las herramientas no abren transacciones: cada sentencia es atómica por sí sola, o corre
// dentro de la transacción de quien las llama.

export type Fila = Record<string, unknown>;

export interface Db {
  consulta<T extends Fila = Fila>(sql: string, valores?: unknown[]): Promise<T[]>;
}

export type ClienteSql = {
  query(sql: string, valores?: unknown[]): Promise<{ rows: unknown[] }>;
};

export function dbDesde(cliente: ClienteSql): Db {
  return {
    async consulta<T extends Fila = Fila>(sql: string, valores: unknown[] = []): Promise<T[]> {
      const r = await cliente.query(sql, valores);
      return r.rows as T[];
    },
  };
}
