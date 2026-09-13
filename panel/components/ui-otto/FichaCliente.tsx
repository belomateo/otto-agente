// Ficha de cliente — compacta y completa. Ver DISENO.md § componentes, 2.
// "Lucía usa esta ficha en cada mensaje": es el contexto que el agente lee
// antes de responder, por eso siempre está a la vista cuando hay una charla
// abierta (Bandeja, Atención humana) o un cliente seleccionado (Clientes).

export type DatosFicha = {
  nombre: string;
  evento: string;
  fecha: string;
  rol: string;
  talle: string;
  ciudad: string;
  color: string;
};

export function FichaClienteCompacta({
  nombre,
  resumen,
  onVerFicha,
}: {
  nombre: string;
  resumen: string;
  onVerFicha?: () => void;
}) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="flex-none font-serif text-[17px] font-semibold">{nombre}</span>
      <span className="min-w-0 flex-1 truncate text-[14px] text-grafito md:text-[13px]">{resumen}</span>
      <button
        type="button"
        onClick={onVerFicha}
        className="flex-none rounded-otto border border-borde bg-lino px-3.5 py-2 text-[14px] font-medium text-tinta md:text-[13.5px]"
      >
        Ver ficha
      </button>
    </div>
  );
}

export function FichaClienteCompleta({ datos }: { datos: DatosFicha }) {
  const campos: [string, string][] = [
    ['EVENTO', datos.evento],
    ['FECHA', datos.fecha],
    ['ROL', datos.rol],
    ['TALLE', datos.talle],
    ['CIUDAD', datos.ciudad],
    ['COLOR', datos.color],
  ];
  return (
    <div className="rounded-otto border border-borde p-4">
      <div className="font-serif text-lg font-semibold">{datos.nombre}</div>
      <div className="mt-3 grid grid-cols-2 gap-x-3.5 gap-y-2.5 text-[14px] md:grid-cols-3 md:text-[13.5px]">
        {campos.map(([label, valor]) => (
          <div key={label}>
            <div className="text-[14px] font-medium text-grafito md:text-[11px]">{label}</div>
            {valor}
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-otto bg-hueso px-3 py-2 text-[14px] text-grafito md:text-[12.5px]">
        Lucía usa esta ficha en cada mensaje.
      </div>
    </div>
  );
}
