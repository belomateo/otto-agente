'use client';

// Bitácora › Analista (0102, pedido de Mateo del 9/10 y 10/10: «una sub-pestaña dentro de la
// Bitácora, solo ahí, con los errores y las mejoras del agente»). Cada noche a las 3 el analista de
// charlas (supabase/functions/analista) revisa las charlas del día anterior y deja acá los errores de
// Lucía —con el mensaje textual y un link a la charla— y las mejoras sugeridas (un dato que faltó en
// las fichas, una frase que se puede decir mejor). Nunca cambia nada solo: cada punto se marca
// «Hecho» o «Descartar». Reemplaza a la vieja «Propuestas», que nunca tuvo datos.
//
// Conectada a GET /api/bitacora/analista?fecha=… (sin fecha, la última noche analizada). La fecha va
// en la URL (?dia=, como Actividad) y las flechas saltan de una noche analizada a la otra.

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDatos } from '@/components/api/useDatos';
import { Cargando } from '@/components/ui-otto/Cargando';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import type { AnalisisDeLaNoche, HallazgoAnalista } from '@/lib/queries/analista';
import { TarjetaHallazgo } from './TarjetaHallazgo';

const ROTULO = 'text-[14px] font-semibold uppercase tracking-[.06em] text-grafito md:text-[11px]';
const FLECHA = 'flex h-8 w-8 flex-none items-center justify-center rounded-otto border border-borde bg-lino text-[16px] leading-none';
const CAMPO = 'rounded-otto border border-borde bg-lino px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-cobre';

function Caja({ children }: { children: React.ReactNode }) {
  return <div className="rounded-otto border border-borde bg-lino">{children}</div>;
}

function Flecha({ fecha, etiqueta, children }: { fecha: string | null; etiqueta: string; children: React.ReactNode }) {
  if (!fecha) {
    return (
      <span aria-hidden className={`${FLECHA} text-[#C9C4B9]`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={`/bitacora/analista?dia=${fecha}`} aria-label={etiqueta} className={`${FLECHA} text-grafito`}>
      {children}
    </Link>
  );
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function Grupo({ titulo, lista, vacio, onCambio }: { titulo: string; lista: HallazgoAnalista[]; vacio: string; onCambio: () => void }) {
  const pendientes = lista.filter((h) => h.estado === 'pendiente');
  const resueltos = lista.filter((h) => h.estado !== 'pendiente');
  return (
    <section className="mt-5">
      <h2 className={`mb-2.5 ${ROTULO}`}>
        {titulo} · {pendientes.length} {pendientes.length === 1 ? 'pendiente' : 'pendientes'}
      </h2>
      {lista.length === 0 && <div className="rounded-otto border border-borde bg-lino px-4 py-3 text-[14px] text-grafito md:text-[13px]">{vacio}</div>}
      <div className="flex flex-col gap-3">
        {pendientes.map((h) => (
          <TarjetaHallazgo key={h.id} h={h} onCambio={onCambio} />
        ))}
      </div>
      {resueltos.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[14px] font-medium text-grafito md:text-[13px]">Resueltos ({resueltos.length})</summary>
          <div className="mt-3 flex flex-col gap-3">
            {resueltos.map((h) => (
              <TarjetaHallazgo key={h.id} h={h} onCambio={onCambio} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

export default function AnalistaPage() {
  const dia = useSearchParams().get('dia');
  const router = useRouter();
  const { datos, cargando, error, recargar } = useDatos<AnalisisDeLaNoche>(`/api/bitacora/analista${dia ? `?fecha=${dia}` : ''}`);

  if (cargando && !datos) return <Cargando />;
  if (error) return <EstadoError mensaje={error} onReintentar={recargar} />;
  if (!datos) return null;

  let contenido: React.ReactNode;
  if (!datos.activo) {
    contenido = (
      <Caja>
        <EstadoVacio
          titulo="El analista todavía no está activado"
          texto="Falta aplicar la migración 0102 y publicar la función analista. Desde la primera noche, acá aparecen los errores de Lucía y las mejoras sugeridas."
        />
      </Caja>
    );
  } else if (!datos.fecha) {
    contenido = (
      <Caja>
        <EstadoVacio
          titulo="Todavía no se analizó ninguna noche"
          texto="Cada noche a las 3, el analista revisa las charlas del día anterior y deja acá los errores de Lucía y las mejoras sugeridas."
        />
      </Caja>
    );
  } else {
    const r = datos.resumen;
    const total = datos.errores.length + datos.mejoras.length;
    contenido = (
      <>
        {r && (
          <div className="mt-3 rounded-otto border border-borde bg-lino px-4 py-3 text-[14px] leading-[1.6] text-grafito md:text-[13px]">
            <span className="font-medium text-tinta">
              {plural(r.analizadas, 'charla revisada', 'charlas revisadas')} · {plural(datos.errores.length, 'error', 'errores')} ·{' '}
              {plural(datos.mejoras.length, 'mejora', 'mejoras')}
            </span>
            {' · '}
            <span className="tabular-nums">{r.costo}</span>
            {r.fallidas > 0 && ` · ${plural(r.fallidas, 'no se pudo analizar', 'no se pudieron analizar')}`}
            {r.salteadas > 0 && ` · ${plural(r.salteadas, 'quedó', 'quedaron')} sin revisar por el tope de la noche`}
            {r.en_curso > 0 && ` · ${plural(r.en_curso, 'en curso', 'en curso')}`}
          </div>
        )}
        {!r ? (
          <div className="mt-3">
            <Caja>
              <EstadoVacio titulo="Esa noche no se analizó" texto="No hay análisis de las charlas de ese día. Elegí otra fecha o usá las flechas." />
            </Caja>
          </div>
        ) : total === 0 ? (
          <div className="mt-3">
            <Caja>
              <EstadoVacio
                titulo="Nada para corregir esa noche"
                texto={r.en_curso > 0 ? 'El análisis de esa noche todavía está en curso.' : `Se revisaron ${plural(r.analizadas, 'charla', 'charlas')} y no apareció ningún error ni mejora.`}
              />
            </Caja>
          </div>
        ) : (
          <>
            <Grupo titulo="Errores de Lucía" lista={datos.errores} vacio="Ningún error de Lucía esa noche." onCambio={recargar} />
            <Grupo titulo="Mejoras sugeridas" lista={datos.mejoras} vacio="Ninguna mejora sugerida esa noche." onCambio={recargar} />
          </>
        )}
      </>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3 md:px-6 md:pt-4">
      <div className="flex flex-wrap items-center gap-2">
        {datos.fecha && (
          <span className="flex min-w-0 items-center gap-2">
            <Flecha fecha={datos.anterior} etiqueta="Noche analizada anterior">
              ‹
            </Flecha>
            <span className="min-w-0 truncate font-serif text-[17px] font-semibold">Charlas del {datos.titulo.toLowerCase()}</span>
            <Flecha fecha={datos.siguiente} etiqueta="Noche analizada siguiente">
              ›
            </Flecha>
          </span>
        )}
        {datos.activo && (
          <input
            type="date"
            aria-label="Elegir el día de las charlas"
            value={datos.fecha ?? ''}
            max={datos.ayer}
            onChange={(e) => e.target.value && router.push(`/bitacora/analista?dia=${e.target.value}`)}
            className={`ml-auto ${CAMPO}`}
          />
        )}
      </div>
      <p className="mt-2 text-[14px] leading-[1.55] text-grafito md:text-[13px]">
        Un modelo revisa cada noche las charlas del día anterior. No cambia nada solo: marcá cada punto «Hecho» cuando lo resolviste o «Descartar» si no corresponde.
      </p>
      {contenido}
    </div>
  );
}
