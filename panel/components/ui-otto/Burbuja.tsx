// Burbuja de mensaje — cliente · Lucía · mostrador. Ver DISENO.md § componentes, 3.
// El ícono "i" en las burbujas de Lucía es el gancho a la bitácora del turno
// (Bitacora.tsx): un mensaje real siempre puede explicar por qué contestó eso.

function Avatar({ letra, bg, fg }: { letra: string; bg: string; fg: string }) {
  return (
    <div
      className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-pill font-serif text-[13px] font-semibold"
      style={{ background: bg, color: fg }}
    >
      {letra}
    </div>
  );
}

export function BurbujaCliente({ texto, hora }: { texto: string; hora: string }) {
  return (
    <div className="max-w-[440px] self-start">
      <div className="rounded-[10px_10px_10px_3px] border border-borde bg-lino px-3.5 py-2.5 text-[15px] leading-[1.45]">
        {texto}
      </div>
      <div className="ml-1 mt-1 text-[11px] text-grafito">{hora}</div>
    </div>
  );
}

export function BurbujaLucia({
  texto,
  hora,
  destacada = false,
  children,
}: {
  texto: string;
  hora: string;
  /** true cuando el mensaje necesitó una herramienta/decisión especial (info destacada) */
  destacada?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex max-w-[480px] items-start gap-2 self-end">
      <div className="flex-1">
        <div className="relative rounded-[10px_10px_3px_10px] bg-noche-suave px-3.5 py-2.5 pr-7 text-[15px] leading-[1.45]">
          {texto}
          <span
            className={`absolute right-2 top-1.5 flex h-4 w-4 items-center justify-center rounded-pill text-[10px] font-semibold ${
              destacada ? 'bg-cobre text-lino' : 'border border-[#C6CBD4] text-grafito'
            }`}
          >
            i
          </span>
        </div>
        <div className="mr-1 mt-1 text-right text-[11px] text-grafito">{hora}</div>
        {children}
      </div>
      <Avatar letra="L" bg="#1F2A3C" fg="#F6F3EE" />
    </div>
  );
}

export function BurbujaMostrador({
  texto,
  hora,
  autor,
  inicial,
}: {
  texto: string;
  hora: string;
  autor: string;
  inicial: string;
}) {
  return (
    <div className="flex max-w-[360px] gap-2 self-end">
      <div>
        <div className="rounded-[10px_10px_3px_10px] bg-cobre-claro px-3.5 py-2.5 text-[14.5px] leading-[1.45]">
          {texto}
        </div>
        <div className="mr-1 mt-1 text-right text-[11px] text-grafito">
          <span className="mr-1 rounded border border-[#E9D9C4] bg-lino px-[5px] py-px text-[10px] font-semibold text-cobre">
            MOSTRADOR
          </span>
          {autor} · {hora}
        </div>
      </div>
      <Avatar letra={inicial} bg="#F1E6D9" fg="#A8703F" />
    </div>
  );
}
