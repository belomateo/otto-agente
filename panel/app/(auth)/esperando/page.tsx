// Esperando aprobación. Puerto de d-esperando.html. H1.10: el perfil nace
// pendiente y solo un admin lo aprueba desde Configuración › Accesos; hasta
// entonces RLS devuelve cero filas, así que esta pantalla es literal.

import Image from 'next/image';
import Link from 'next/link';

export default function EsperandoPage() {
  return (
    <div className="flex w-[400px] flex-col items-center gap-4.5 text-center">
      <Image src="/logo-otto.png" alt="Otto Su Misura" width={64} height={64} className="rounded-pill" />
      <div className="font-serif text-xl font-semibold">Tu solicitud está esperando</div>
      <div className="text-[15px] leading-[1.6] text-grafito">
        Un administrador tiene que aprobarla. Te avisamos por email en cuanto esté lista.
      </div>
      <Link href="/login" className="text-sm">
        Volver al inicio
      </Link>
    </div>
  );
}
