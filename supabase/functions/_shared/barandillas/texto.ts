// Herramientas de texto de las barandillas: normalizar como escribe cualquiera (sin tildes, en
// minúsculas) y partir en oraciones para cortar o sacar una sin romper los párrafos.

export function normalizar(t: string): string {
  return String(t ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// ¿La frase aparece entera (no como pedazo de otra palabra) en el texto ya normalizado?
export function contieneFrase(normalizado: string, frase: string): boolean {
  const escapada = frase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapada}([^\\p{L}\\p{N}]|$)`, "u").test(normalizado);
}

export type Oracion = { parrafo: number; texto: string };

export function oraciones(t: string): Oracion[] {
  const res: Oracion[] = [];
  String(t ?? "").split(/\n\s*\n/).forEach((parrafo, i) => {
    for (const linea of parrafo.split("\n")) {
      for (const o of linea.split(/(?<=[.!?…])\s+/)) if (o.trim()) res.push({ parrafo: i, texto: o.trim() });
    }
  });
  return res;
}

export function rearmar(os: Oracion[]): string {
  const porParrafo = new Map<number, string[]>();
  for (const o of os) porParrafo.set(o.parrafo, [...(porParrafo.get(o.parrafo) ?? []), o.texto]);
  return [...porParrafo.keys()].sort((a, b) => a - b).map((k) => (porParrafo.get(k) ?? []).join(" ")).join("\n\n");
}

export function sacarPreguntas(t: string): string {
  return rearmar(oraciones(t).filter((o) => !/[?¿]/.test(o.texto)));
}
