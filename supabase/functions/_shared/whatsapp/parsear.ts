// Saca del payload del webhook de Meta los mensajes entrantes, uno por cada elemento de
// `messages`. Los avisos de estado (sent / delivered / read) vienen en `statuses` y no
// generan trabajo: acá se ignoran.
export type MensajeEntrante = {
  waMessageId: string;
  // Formato de Meta: E.164 sin "+", ej. 5493417519525.
  telefono: string;
  nombre: string | null;
  tipo: string;
  contenido: string | null;
  // ISO. Meta manda segundos desde epoch en `timestamp`.
  enviadoAt: string | null;
  // El mensaje tal cual llegó: el worker y la confirmación por botón (H1.14) lo leen.
  crudo: Record<string, unknown>;
};

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const lista = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(esObj) : []);
const texto = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

// El texto legible de cada tipo. Lo que no trae texto (una foto sin epígrafe, un audio) queda
// en null: con el tipo alcanza para que el worker decida qué hacer.
function contenidoDe(m: Obj, tipo: string): string | null {
  const bloque = m[tipo];
  if (!esObj(bloque)) return null;
  switch (tipo) {
    case "text":
      return texto(bloque.body);
    case "button": // respuesta a un botón de una plantilla (ej. "Confirmo")
      return texto(bloque.text);
    case "interactive": {
      const boton = bloque.button_reply;
      const opcion = bloque.list_reply;
      if (esObj(boton)) return texto(boton.title);
      if (esObj(opcion)) return texto(opcion.title);
      return null;
    }
    case "image":
    case "video":
    case "document":
      return texto(bloque.caption);
    case "location":
      return texto(bloque.name) ?? texto(bloque.address);
    default:
      return null;
  }
}

export function mensajesEntrantes(cuerpo: unknown): MensajeEntrante[] {
  if (!esObj(cuerpo) || cuerpo.object !== "whatsapp_business_account") return [];
  const salida: MensajeEntrante[] = [];
  for (const entrada of lista(cuerpo.entry)) {
    for (const cambio of lista(entrada.changes)) {
      const valor = cambio.value;
      if (cambio.field !== "messages" || !esObj(valor)) continue;

      const nombres = new Map<string, string>();
      for (const contacto of lista(valor.contacts)) {
        const perfil = contacto.profile;
        const nombre = esObj(perfil) ? texto(perfil.name) : null;
        const waId = texto(contacto.wa_id);
        if (waId && nombre) nombres.set(waId, nombre);
      }

      for (const m of lista(valor.messages)) {
        const id = texto(m.id);
        const de = texto(m.from);
        const tipo = texto(m.type);
        if (!id || !de || !tipo) continue;
        const segundos = Number(m.timestamp);
        salida.push({
          waMessageId: id,
          telefono: de,
          nombre: nombres.get(de) ?? null,
          tipo,
          contenido: contenidoDe(m, tipo),
          enviadoAt: Number.isFinite(segundos) && segundos > 0 ? new Date(segundos * 1000).toISOString() : null,
          crudo: m,
        });
      }
    }
  }
  return salida;
}
