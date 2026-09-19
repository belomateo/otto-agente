'use client';

// Límite de error de toda la app (Next.js: panel/app/error.tsx). Sin esto, si algo revienta en
// el render, la persona ve la pantalla de error de Next en inglés, sin salida ("Application
// error: a client-side exception has occurred"). Bandeja es la pantalla más segura para volver
// (siempre tiene datos, no depende de un id de la URL que pudo ser el causante del error).

import { useEffect } from 'react';
import Link from 'next/link';
import { EstadoError } from '@/components/ui-otto/EstadoError';

export default function ErrorGeneral({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-hueso px-5">
      <EstadoError mensaje="Pasó algo que no esperábamos. El equipo ya lo puede ver en la consola." />
      <Link href="/bandeja" className="rounded-otto bg-cobre px-4.5 py-2.5 text-[14px] font-medium text-lino">
        Volver a Bandeja
      </Link>
    </div>
  );
}
