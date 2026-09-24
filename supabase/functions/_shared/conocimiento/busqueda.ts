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

// Cómo nombra un cliente algo que la ficha escribe con otra palabra. Es idioma, no dato del
// negocio, igual que ABREVIATURAS. Dos reglas lo hacen seguro:
//  · SUMA, no reemplaza: la palabra del cliente sigue en la consulta, así un sinónimo mal
//    elegido solo agrega una pista de más y nunca borra la buena.
//  · el destino TIENE que existir en alguna ficha. Apuntar al vacío es PEOR que no hacer nada:
//    el corrector de erratas de más abajo lo empareja con la raíz más parecida del vocabulario
//    y desvía la consulta a cualquier tema.
//
// Hallazgo de logica, 23/9 (barrido de 486 agentes contra la base real): 83 preguntas de cliente
// real devolvían CERO fragmentos porque el cliente no escribe con las palabras del negocio
// ("cuotas?", "hay para mujeres", "soy gordo", "casorio"). Este mapa (326 palabras) lo tapa. Se
// podó de 344 a 326 sacando 18 palabras que rompían consultas que hoy andan bien (juzgadas una
// por una contra los 104 casos que cambiaban de resultado): flaco/flaca (saludo, no cuerpo),
// meter (plata, no sastrería), cuesta (dificultad, no precio), sale (retiro, no precio), echo
// ("hecho" mal escrito), recibe (recibir, no recibirse), robo (literal), promocion (camada de
// egresados), chiquito/chiquita (tamaño de mancha, no de persona), mujer ("mi mujer" es esposa),
// y modificar/adaptar/transferir/suspender/acortar (se usan para fechas y turnos, no para ropa).
// Verificados los 326 destinos contra el vocabulario real: ninguno apunta al vacío.
const SINONIMOS: Record<string, string> = {
  "2x1": "promo",
  abarca: "incluye",
  abarcan: "incluye",
  abarcar: "incluye",
  abierto: "abre",
  abiertos: "abre",
  acortan: "achicar arreglo",
  acortarlo: "achicar arreglo",
  adaptan: "arreglo medida",
  adaptarlo: "arreglo medida",
  adelanto: "seña",
  adicional: "aparte incluye",
  adicionales: "aparte incluye",
  adolescente: "chico",
  agasajo: "fiesta",
  agrandan: "arreglo medida",
  agrandar: "arreglo medida",
  ajustarlo: "arreglo",
  ajustarlos: "arreglo",
  alcance: "caro",
  alias: "transferencia pago",
  alto: "talle",
  altura: "talle",
  anticipo: "seña",
  anulacion: "cancelación penalidad",
  "anulación": "cancelación penalidad",
  anular: "cancelación penalidad",
  arrepenti: "cancelar cancelación",
  "arrepentí": "cancelar cancelación",
  arrepiento: "cancelar cancelación",
  atuendo: "ambo aparte",
  azul: "color",
  barrio: "calle",
  barrios: "calle",
  bebe: "niño",
  bebes: "niño",
  "bebé": "niño",
  "bebés": "niño",
  beige: "color",
  beneficio: "descuento",
  beneficios: "descuento",
  berreta: "calidad",
  berretas: "calidad",
  boda: "casamiento novio",
  bodas: "casamiento novio",
  bonificacion: "descuento",
  "bonificación": "descuento",
  bonifican: "descuento",
  bonificar: "descuento",
  bordo: "color",
  caemos: "mirar",
  caes: "mirar",
  caigo: "mirar",
  carisimo: "caro",
  "carísimo": "caro",
  casorio: "casamiento",
  casorios: "casamiento",
  catalogo: "opciones",
  catalogos: "opciones",
  cbu: "transferencia pago",
  cena: "fiesta",
  cita: "turno",
  citas: "turno",
  colacion: "graduacion egresados",
  cole: "colegio egresados",
  combo: "ambo aparte",
  comprometi: "novio",
  comprometido: "novio",
  conjunto: "ambo aparte",
  conjuntos: "ambo aparte",
  contacto: "teléfono",
  contextura: "talle",
  corpulenta: "talle",
  corpulento: "talle",
  cortejo: "grupo descuento",
  cose: "sastre arreglo",
  cosen: "sastre arreglo",
  coser: "sastre arreglo",
  costo: "precio",
  costurera: "sastre arreglo",
  costurero: "sastre arreglo",
  cotizacion: "precio",
  "cotización": "precio",
  cotizan: "precio",
  cotizar: "precio",
  cotizaron: "comparar",
  criatura: "niño",
  criaturas: "niño",
  cuerpo: "talle",
  cuestan: "precio",
  cuota: "tarjeta crédito pagos",
  cuotas: "tarjeta crédito pagos",
  cupon: "promo",
  cupones: "promo",
  "cupón": "promo",
  dama: "hombre",
  damas: "hombre",
  deposito: "seña garantía",
  "depósito": "seña garantía",
  desc: "descuento",
  despedida: "fiesta",
  devolveran: "cancelación penalidad",
  "devolverán": "cancelación penalidad",
  devuelven: "cancelación penalidad",
  diferencia: "comparar",
  diferencias: "comparar",
  dinero: "plata",
  diploma: "graduacion egresados",
  diplomas: "graduacion egresados",
  domicilio: "envio casa",
  dto: "descuento",
  economico: "caro",
  economicos: "caro",
  "económico": "caro",
  "económicos": "caro",
  egresadito: "egresados",
  egresaditos: "egresados",
  elegirlos: "comparar",
  enano: "talle",
  ensanchan: "arreglo medida",
  ensanchar: "arreglo medida",
  entalla: "arreglo medida",
  entallado: "arreglo medida",
  entallan: "arreglo medida",
  entallar: "arreglo medida",
  entregamos: "retiro",
  entregan: "retiro",
  entregarlo: "retiro",
  entregas: "retiro",
  "entregás": "retiro",
  espalda: "medida",
  estatura: "talle",
  estrechan: "arreglo medida",
  estrechar: "arreglo medida",
  fabrican: "confeccionan arreglo",
  fabricar: "confeccionan arreglo",
  facebook: "comparar",
  femenina: "hombre",
  femenino: "hombre",
  financiacion: "tarjeta crédito pagos",
  "financiación": "tarjeta crédito pagos",
  financian: "tarjeta crédito pagos",
  financiar: "tarjeta crédito pagos",
  fisherton: "calle",
  flacas: "talle",
  flacos: "talle",
  flacucho: "talle",
  fortuna: "caro",
  funes: "calle",
  gala: "fiesta",
  gigante: "talle",
  gorda: "talle",
  gordas: "talle",
  gordita: "talle",
  gordito: "talle",
  gordo: "talle",
  gordos: "talle",
  gradua: "graduacion egresados",
  graduarse: "graduacion egresados",
  gradue: "graduacion egresados",
  graduo: "graduacion egresados",
  grandota: "talle",
  grandote: "talle",
  grandulon: "talle",
  "grandulón": "talle",
  gris: "color",
  grupal: "grupo descuento",
  grupales: "grupo descuento",
  guri: "niño",
  gurises: "niño",
  gurisito: "niño",
  "gurí": "niño",
  igualan: "comparar",
  igualar: "comparar",
  importe: "seña pago",
  infantil: "niño",
  infantiles: "niño",
  interes: "recargo",
  "interés": "recargo",
  invitacion: "invitados",
  invitaciones: "invitados",
  kaso: "caso",
  lava: "tintoreria",
  lavado: "tintoreria",
  lavan: "tintoreria",
  lavar: "tintoreria",
  lavarlo: "tintoreria",
  limpia: "tintoreria",
  limpian: "tintoreria",
  limpiar: "tintoreria",
  limpieza: "tintoreria",
  llamada: "teléfono",
  llamar: "teléfono",
  llamarlos: "teléfono",
  marketplace: "comparar",
  mastercard: "tarjeta crédito débito",
  matrimonio: "casamiento novio",
  matrimonios: "casamiento novio",
  menor: "niño",
  menores: "niño",
  menudo: "talle",
  meten: "arreglo medida",
  metodos: "pago efectivo transferencia tarjeta",
  mide: "talle",
  mido: "talle",
  modifican: "arreglo medida",
  modista: "sastre arreglo",
  modisto: "sastre arreglo",
  morruda: "talle",
  morrudo: "talle",
  mujeres: "hombre",
  multa: "penalidad",
  "métodos": "pago efectivo transferencia tarjeta",
  negro: "color",
  nena: "niño",
  nenas: "niño",
  nene: "niño",
  nenes: "niño",
  nenita: "niño",
  nenito: "niño",
  ninita: "niño",
  ninito: "niño",
  "niñita": "niño",
  "niñito": "niño",
  nubes: "caro",
  obesa: "talle",
  obesidad: "talle",
  obeso: "talle",
  oferta: "promo",
  ofertas: "promo",
  oscuro: "color",
  padrinos: "grupo",
  patota: "grupo descuento",
  percha: "arreglo medida",
  perder: "cancelación penalidad",
  petisa: "talle",
  petiso: "talle",
  petisos: "talle",
  pibe: "chico",
  pibes: "chico",
  pibito: "chico",
  pibitos: "chico",
  pichincha: "calle",
  pierde: "cancelación penalidad",
  pierdo: "cancelación penalidad",
  pierna: "pantalon arreglo",
  piernas: "pantalon arreglo",
  pilcha: "look",
  pilchas: "look",
  plancha: "tintoreria",
  planchada: "tintoreria",
  planchado: "tintoreria",
  planchan: "tintoreria",
  planchar: "tintoreria",
  plancharlo: "tintoreria",
  porte: "talle",
  posnet: "tarjeta crédito débito",
  premiacion: "fiesta",
  presencial: "envio local",
  prestan: "retiro dias",
  prestar: "retiro dias",
  presupuesto: "precio",
  procedimiento: "paso",
  procedimientos: "paso",
  prometido: "novio",
  promociones: "promo",
  quince: "cumple",
  rechoncho: "talle",
  recibirme: "graduacion egresados",
  recibirse: "graduacion egresados",
  recibirte: "graduacion egresados",
  reembolsan: "cancelación devolución",
  reembolso: "cancelación devolución",
  reintegran: "cancelación devolución",
  reintegro: "cancelación devolución",
  robusta: "talle",
  robusto: "talle",
  salen: "precio",
  secu: "secundario egresados",
  senora: "hombre",
  senoras: "hombre",
  sexto: "secundario egresados",
  "señora": "hombre",
  "señoras": "hombre",
  sobrepeso: "talle",
  staff: "uniforme empresa",
  sucursal: "calle",
  sucursales: "calle",
  suspende: "cancelación penalidad",
  suspenden: "cancelación penalidad",
  suspendio: "cancelación penalidad",
  "suspendió": "cancelación penalidad",
  suspendo: "cancelación penalidad",
  tamano: "talle",
  tamanos: "talle",
  "tamaño": "talle",
  "tamaños": "talle",
  tanque: "talle",
  tarifa: "precio",
  tel: "teléfono",
  titulo: "graduacion egresados",
  titulos: "graduacion egresados",
  transferi: "transferencia",
  "transferí": "transferencia",
  transfieren: "transferencia",
  transfiero: "transferencia",
  ubicacion: "calle",
  ubicadas: "calle",
  ubicado: "calle",
  ubicados: "calle",
  unisex: "hombre",
  valor: "precio",
  varon: "hombre",
  varoncito: "niño",
  varones: "hombre",
  "varón": "hombre",
  ventaja: "comparar",
  ventajas: "comparar",
  vestimenta: "look",
  virtual: "envio local",
  visa: "tarjeta crédito débito",
  vs: "comparar",
  xxl: "talle",
  xxxl: "talle",
  xxxxl: "talle",
  zona: "calle",
};

export function normalizarConsulta(texto: string): string {
  const palabras = String(texto ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => ABREVIATURAS[p] ?? p);
  const extra: string[] = [];
  for (const p of palabras) {
    for (const s of (SINONIMOS[p] ?? "").split(" ").filter(Boolean)) {
      if (!palabras.includes(s) && !extra.includes(s)) extra.push(s);
    }
  }
  return [...palabras, ...extra].join(" ");
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
