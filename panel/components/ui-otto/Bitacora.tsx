// Bitácora desplegable + mini resumen. Ver DISENO.md § componentes, 4.
// Muestra qué hizo el agente en un turno: qué herramienta llamó, qué pensó,
// cuánto costó. Es la ventana a "por qué Lucía contestó eso" — AGENTE.md § 2
// insiste en que nada determinístico se resuelve con el LLM, y esto es lo que
// lo prueba en pantalla. Plegarla y desplegarla lo resuelve BurbujaLucia (la «i»).

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
              className="rounded-bloque bg-ambar-suave px-[9px] py-1 text-[14px] font-medium text-ambar md:text-xs"
            >
              ⚠ {a}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-[7px] rounded-otto border border-borde bg-lino px-3.5 py-3">
        <div className="text-[14px] font-semibold uppercase tracking-[.06em] text-grafito md:text-[11px]">
          Bitácora del turno
        </div>
        {pasos.map((p, i) => {
          if (p.tipo === 'pensamiento') {
            return (
              <div
                key={i}
                className="border-l-2 border-borde pl-2.5 text-[14px] italic leading-[1.5] text-grafito md:text-[13.5px]"
              >
                «{p.texto}»
              </div>
            );
          }
          const marca = p.tipo === 'ok' ? '✓' : '✗';
          const color = p.tipo === 'ok' ? 'text-salvia' : 'text-ladrillo';
          return (
            <div key={i} className="flex gap-2 text-[14px] md:text-[13.5px]">
              <span className={`flex-none font-semibold ${color}`}>{marca}</span>
              <span className={`min-w-0 break-words ${p.codigo ? 'font-mono text-[14px] md:text-[12.5px]' : ''}`}>{p.texto}</span>
            </div>
          );
        })}
        {costo && <div className="font-mono text-[14px] tabular-nums text-grafito md:text-[11.5px]">{costo}</div>}
      </div>
    </div>
  );
}
