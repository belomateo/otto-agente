// Cambio obligatorio de contraseña — cae acá cualquiera con perfiles.debe_cambiar_clave en
// true (alta directa por un admin, Configuración › Accesos: la cuenta nace con una clave
// temporal). El middleware (paneles) manda para acá con 307 en cualquier página y devuelve
// 403 {codigo:'debe_cambiar_clave'} en cualquier /api/** mientras siga en true — las únicas
// excepciones son esta misma página y PATCH /api/mi-cuenta/clave. Pedido de Mateo, 21/9.
//
// PATCH /api/mi-cuenta/clave por fetch directo, no por components/api/cliente.ts: esa ruta
// usa 401 para "la contraseña actual está mal" (reautenticación fallida), un significado
// distinto del 401 de "no hay sesión" que cliente.ts ya interpreta como para mandar a /login
// (H1.10, fix de la auditoría de logica). Iría a parar a /login por una contraseña mal
// tipeada, así que esta pantalla no pasa por ese camino.
'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { crearClienteNavegador } from '@/lib/supabase/client';

export default function CambiarClavePage() {
  const router = useRouter();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (nueva !== repetir) {
      setError('Las dos claves nuevas no coinciden.');
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch('/api/mi-cuenta/clave', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actual, nueva }),
      });
      const cuerpo = await r.json().catch(() => null);
      if (!r.ok) {
        setError(cuerpo?.error ?? 'No se pudo cambiar la contraseña. Probá de nuevo.');
        setEnviando(false);
        return;
      }
      router.push('/bandeja');
      router.refresh();
    } catch {
      setError('No pudimos conectarnos con el servidor. Revisá tu conexión y probá de nuevo.');
      setEnviando(false);
    }
  }

  async function cerrarSesion() {
    const supabase = crearClienteNavegador();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="flex w-[340px] flex-col items-center gap-4.5">
      <Image src="/logo-otto.png" alt="Otto Su Misura" width={64} height={64} className="rounded-pill" />
      <div className="text-center">
        <div className="font-serif text-xl font-semibold">Cambiá tu contraseña</div>
        <div className="mt-1.5 text-[14px] leading-[1.5] text-grafito">
          Entraste con una contraseña temporal. Elegí una nueva para poder seguir usando el panel.
        </div>
      </div>
      <form onSubmit={onSubmit} className="flex w-full flex-col gap-3">
        <input
          type="password"
          required
          placeholder="Contraseña actual (la temporal)"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          className="rounded-otto border border-borde bg-lino px-3.5 py-3 text-[15px] outline-none"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="Contraseña nueva"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          className="rounded-otto border border-borde bg-lino px-3.5 py-3 text-[15px] outline-none"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="Repetí la contraseña nueva"
          value={repetir}
          onChange={(e) => setRepetir(e.target.value)}
          className="rounded-otto border border-borde bg-lino px-3.5 py-3 text-[15px] outline-none"
        />
        {error && <div className="text-sm text-ladrillo">{error}</div>}
        <button
          type="submit"
          disabled={enviando}
          className="rounded-otto bg-cobre py-3 text-[15px] font-medium text-lino disabled:opacity-60"
        >
          {enviando ? 'Cambiando…' : 'Cambiar contraseña'}
        </button>
      </form>
      <button type="button" onClick={cerrarSesion} className="text-sm text-grafito underline">
        Cerrar sesión
      </button>
    </div>
  );
}
