// Bitácora desplegable + mini resumen. Ver DISENO.md § componentes, 4.
// Muestra qué hizo el agente en un turno: qué herramienta llamó, qué pensó,
// cuánto costó. Es la ventana a "por qué Lucía contestó eso" — AGENTE.md § 2
// insiste en que nada determinístico se resuelve con el LLM, y esto es lo que
// lo prueba en pantalla.

export type PasoBitacora =
  | { tipo: 'ok'; texto: string; codigo?: boolean }
  | { tipo: 'error'; texto: string; codigo?: boolean }
  | { tipo: 'pensamiento'; texto: string };

export function Bitacora({
  pasos,
  costo,
  advertencias = [],
}: {
  pasos: PasoBitacora[];
  costo?: string;
  advertencias?: string[];
}) {
  return (
    <div className="flex flex-col gap-3.5">
      {advertencias.length > 0 && (
        <div className="flex flex-wrap gap-2.5">
          {advertencias.map((a) => (
            <span
              key={a}
              className="rounded-bloque bg-ambar-suave px-[9px] py-1 text-xs font-medium text-ambar"
            >
              ⚠ {a}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-[7px] rounded-otto border border-borde bg-lino px-3.5 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[.06em] text-grafito">
          Bitácora del turno
        </div>
        {pasos.map((p, i) => {
          if (p.tipo === 'pensamiento') {
            return (
              <div
                key={i}
                className="border-l-2 border-borde pl-2.5 text-[13.5px] italic leading-[1.5] text-grafito"
              >
                «{p.texto}»
              </div>
            );
          }
          const marca = p.tipo === 'ok' ? '✓' : '✗';
          const color = p.tipo === 'ok' ? 'text-salvia' : 'text-ladrillo';
          return (
            <div key={i} className="flex gap-2 text-[13.5px]">
              <span className={`font-semibold ${color}`}>{marca}</span>
              <span className={p.codigo ? 'font-mono text-[12.5px]' : undefined}>{p.texto}</span>
            </div>
          );
        })}
        {costo && <div className="font-mono text-[11.5px] text-grafito">{costo}</div>}
      </div>
    </div>
  );
}
