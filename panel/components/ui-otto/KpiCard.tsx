// Tarjeta de número del día. Ver DISENO.md § componentes, 8 y § tipografía
// (numero = Fraunces 600, tabular-nums — nunca perder el alineado de dígitos
// en una fila de KPIs).

export function KpiCard({ numero, label, sub }: { numero: string; label: string; sub: string }) {
  return (
    <div className="rounded-otto border border-borde bg-lino px-[18px] py-4">
      <div className="font-serif text-[34px] font-semibold leading-none tabular-nums">{numero}</div>
      <div className="mt-2 text-[13.5px] font-medium">{label}</div>
      <div className="mt-0.5 text-xs text-grafito">{sub}</div>
    </div>
  );
}
