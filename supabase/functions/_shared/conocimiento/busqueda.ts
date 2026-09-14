// Búsqueda en la base de conocimiento (tabla fragmentos).
//
// La usan buscar_informacion (Deno, en el turno de Lucía) y scripts/probar-busqueda.js (Node,
// hito 1.6): el mismo código, así lo que prueba el script es exactamente lo que hace Lucía.
// Por eso este archivo no importa nada y solo usa sintaxis que Node puede leer sin compilar.
//
// Cómo busca, todo determinístico (AGENTE.md § 2):
//  1. Normaliza cómo escribe un cliente: minúsculas, sin signos ni emojis, y las abreviaturas
//     de WhatsApp pasadas a palabra (q → que, xq → porque, tmb → también).
//  2. Postgres saca los lexemas de la consulta con el mismo diccionario que la columna
//     `busqueda` de fragmentos (spanish + unaccent, 0005): sin tildes, sin palabras vacías y
//     reducidas a su raíz ("zapatos" → "zapat").
//  3. Un lexema que no aparece en ningún fragmento se corrige al más parecido del vocabulario
//     de la base, con una letra de diferencia (dos si es largo): "sapat" → "zapat".
//  4. Puntaje BM25 entre la consulta y cada fragmento activo; una palabra que está en el
//     título pesa más. Con sección se ordenan los de esa sección; sin sección, todos, y solo
//     vuelven los que tienen alguna palabra en común.

export type ConsultaSql = {
  consulta(sql: string, valores?: unknown[]): Promise<Record<string, unknown>[]>;
};

export type FragmentoBuscable = {
  id: string;
  tema: string;
  titulo: string;
  texto: string;
  frecuencias: Record<string, number>;
  lexemasTitulo: string[];
};

export type Encontrado = { id: string; tema: string; titulo: string; texto: string; puntaje: number };

export const SQL_LEXEMAS_CONSULTA =
  "select tsvector_to_array(to_tsvector('spanish', immutable_unaccent($1))) as lexemas";

export const SQL_FRAGMENTOS_BUSCABLES = `
  select f.id::text as id, f.tema, f.titulo, f.texto,
    (select coalesce(jsonb_object_agg(u.lexeme, coalesce(array_length(u.positions, 1), 1)), '{}'::jsonb)
       from unnest(f.busqueda) u) as frecuencias,
    tsvector_to_array(to_tsvector('spanish', immutable_unaccent(f.titulo))) as lexemas_titulo
  from fragmentos f
  where f.activo
  order by f.tema, f.titulo, f.id`;

// Cómo abrevia un cliente por WhatsApp. Es idioma, no dato del negocio.
const ABREVIATURAS: Record<string, string> = {
  q: "que", k: "que", xq: "porque", pq: "porque", porq: "porque", x: "por", xa: "para",
  pa: "para", tb: "también", tmb: "también", tbn: "también", d: "de", dnd: "donde",
  cdo: "cuando", xfa: "por favor", porfa: "por favor", hs: "horas", hr: "hora", hrs: "horas",
  dsp: "después", dps: "después", info: "información", finde: "fin de semana",
  mñn: "mañana", mña: "mañana", tmp: "tampoco", nd: "nada",
};

export function normalizarConsulta(texto: string): string {
  return String(texto ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => ABREVIATURAS[p] ?? p)
    .join(" ");
}

// Distancia de edición con transposición (dos letras cambiadas de lugar cuentan como una).
function distancia(a: string, b: string, tope: number): number {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) d.push([i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// Cuántas letras de diferencia se perdonan según el largo de la raíz.
function tolerancia(largo: number): number {
  if (largo >= 7) return 2;
  if (largo >= 4) return 1;
  return 0;
}

const K1 = 1.2;
const B = 0.75;
const PESO_TITULO = 1.5;

export function rankear(
  lexemas: string[],
  fragmentos: FragmentoBuscable[],
  opciones: { seccion?: string | null; limite?: number } = {},
): { encontrados: Encontrado[]; corregidos: Record<string, string> } {
  const n = fragmentos.length;
  if (n === 0) return { encontrados: [], corregidos: {} };

  const df = new Map<string, number>();
  const largos = new Map<string, number>();
  let largoTotal = 0;
  for (const f of fragmentos) {
    let largo = 0;
    for (const [lexema, veces] of Object.entries(f.frecuencias)) {
      df.set(lexema, (df.get(lexema) ?? 0) + 1);
      largo += veces;
    }
    largos.set(f.id, largo);
    largoTotal += largo;
  }
  const largoMedio = largoTotal / n || 1;
  const vocabulario = [...df.keys()].sort();

  const corregidos: Record<string, string> = {};
  const terminos = new Set<string>();
  for (const lexema of lexemas) {
    if (df.has(lexema)) {
      terminos.add(lexema);
      continue;
    }
    const tope = tolerancia(lexema.length);
    if (tope === 0) continue;
    let mejor: string | null = null;
    let mejorDistancia = tope + 1;
    let mejorDf = -1;
    for (const v of vocabulario) {
      const dd = distancia(lexema, v, tope);
      const dfv = df.get(v) ?? 0;
      if (dd < mejorDistancia || (dd === mejorDistancia && dfv > mejorDf)) {
        mejor = v;
        mejorDistancia = dd;
        mejorDf = dfv;
      }
    }
    if (mejor !== null && mejorDistancia <= tope) {
      corregidos[lexema] = mejor;
      terminos.add(mejor);
    }
  }

  const idf = (t: string) => {
    const k = df.get(t) ?? 0;
    return Math.log(1 + (n - k + 0.5) / (k + 0.5));
  };

  const puntuados: Encontrado[] = fragmentos
    .filter((f) => !opciones.seccion || f.tema === opciones.seccion)
    .map((f) => {
      const largo = largos.get(f.id) ?? 0;
      let puntaje = 0;
      for (const t of terminos) {
        const tf = f.frecuencias[t] ?? 0;
        if (!tf) continue;
        const peso = f.lexemasTitulo.includes(t) ? PESO_TITULO : 1;
        puntaje += peso * idf(t) * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * largo / largoMedio));
      }
      return { id: f.id, tema: f.tema, titulo: f.titulo, texto: f.texto, puntaje: Math.round(puntaje * 1000) / 1000 };
    });

  const candidatos = opciones.seccion ? puntuados : puntuados.filter((x) => x.puntaje > 0);
  candidatos.sort((a, b) =>
    b.puntaje - a.puntaje || a.tema.localeCompare(b.tema) || a.titulo.localeCompare(b.titulo) || a.id.localeCompare(b.id)
  );
  return { encontrados: candidatos.slice(0, opciones.limite ?? 3), corregidos };
}

export async function buscarFragmentos(
  db: ConsultaSql,
  p: { seccion?: string | null; consulta: string; limite?: number },
): Promise<{ encontrados: Encontrado[]; corregidos: Record<string, string>; lexemas: string[]; normalizada: string }> {
  const normalizada = normalizarConsulta(p.consulta);
  const filaLexemas = (await db.consulta(SQL_LEXEMAS_CONSULTA, [normalizada]))[0];
  const lexemas = ((filaLexemas?.lexemas ?? []) as string[]).map(String);
  const filas = await db.consulta(SQL_FRAGMENTOS_BUSCABLES);
  const fragmentos: FragmentoBuscable[] = filas.map((f) => ({
    id: String(f.id),
    tema: String(f.tema),
    titulo: String(f.titulo),
    texto: String(f.texto),
    frecuencias: (f.frecuencias ?? {}) as Record<string, number>,
    lexemasTitulo: ((f.lexemas_titulo ?? []) as string[]).map(String),
  }));
  const r = rankear(lexemas, fragmentos, { seccion: p.seccion ?? null, limite: p.limite });
  return { ...r, lexemas, normalizada };
}

// Todo el texto activo de una sección, en orden. Lo usan las herramientas que devuelven una
// condición junto con un dato (qué incluye el precio, condiciones de los accesorios).
export async function textosDeSeccion(db: ConsultaSql, tema: string): Promise<string | null> {
  const filas = await db.consulta(
    "select texto from fragmentos where activo and tema = $1 order by titulo, id",
    [tema],
  );
  return filas.length ? filas.map((f) => String(f.texto).trim()).join("\n\n") : null;
}
