// Esperando aprobación. H1.10: el perfil nace pendiente y solo un admin lo
// aprueba desde Configuración › Accesos; hasta entonces RLS devuelve cero
// filas (así que si alguien fuerza la URL de una pestaña, no ve nada igual).
'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { crearClienteNavegador } from '@/lib/supabase/client';

export default function EsperandoPage() {
  const router = useRouter();
  const [revisando, setRevisando] = useState(false);

  async function revisarDeNuevo() {
    setRevisando(true);
    router.push('/bandeja'); // si ya lo aprobaron, el middleware lo deja pasar; si no, vuelve para acá
    router.refresh();
    setRevisando(false);
  }

  async function cerrarSesion() {
    const supabase = crearClienteNavegador();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="flex w-[400px] flex-col items-center gap-4.5 text-center">
      <Image src="/logo-otto.png" alt="Otto Su Misura" width={64} height={64} className="rounded-pill" />
      <div className="font-serif text-xl font-semibold">Tu solicitud está esperando</div>
      <div className="text-[15px] leading-[1.6] text-grafito">
        Un administrador tiene que aprobarla. Te avisamos por email en cuanto esté lista.
      </div>
      <button onClick={revisarDeNuevo} disabled={revisando} className="text-sm font-medium text-cobre">
        {revisando ? 'Revisando…' : 'Ya me aprobaron, revisar de nuevo'}
      </button>
      <button onClick={cerrarSesion} className="text-sm text-grafito underline">
        Cerrar sesión
      </button>
    </div>
  );
}
