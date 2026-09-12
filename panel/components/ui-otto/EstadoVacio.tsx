// Estado vacío. Ver DISENO.md § componentes, 9.
// El avatar "L" de Lucía firma el estado vacío para que no se lea como un
// error: es Lucía diciendo "todavía no hay nada acá", no la app rota.

export function EstadoVacio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-9 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-pill bg-noche font-serif text-[22px] font-semibold text-hueso">
        L
      </div>
      <div className="font-serif text-[17px] font-semibold">{titulo}</div>
      <div className="max-w-[280px] text-sm leading-[1.55] text-grafito">{texto}</div>
    </div>
  );
}
