// Login + registro abierto (CLAUDE.md § 1: "El dueño edita sin programador",
// registro abierto pero el perfil nace pendiente — TRABAJO.md H1.10). El molde
// visual es el de Claude Design (d-login.html); esto le suma la lógica real de
// Supabase Auth encima.
'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { crearClienteNavegador } from '@/lib/supabase/client';

// Traduce el error de Supabase Auth a algo que el equipo pueda accionar. Antes
// todo caía en "Email o contraseña incorrectos", así que un rate limit (429) o
// el servidor caído se leían como "me equivoqué de clave" y la persona seguía
// reintentando, que es justo lo que empeora las dos cosas.
function mensajeDeError(error: { message: string; status?: number }, modo: 'entrar' | 'crear-cuenta') {
  const msg = error.message ?? '';
  if (error.status === 429 || /rate limit|too many/i.test(msg)) {
    return 'Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.';
  }
  if (/fetch|network|failed to fetch|timeout/i.test(msg)) {
    return 'No pudimos conectarnos con el servidor. Revisá tu conexión y probá de nuevo.';
  }
  if (modo === 'crear-cuenta') {
    if (/already registered|already been registered|user_already_exists/i.test(msg)) {
      return 'Ese email ya tiene una cuenta.';
    }
    if (/password/i.test(msg)) return 'La contraseña tiene que tener al menos 6 caracteres.';
    if (/email/i.test(msg)) return 'Revisá el email: no parece válido.';
    return 'No se pudo crear la cuenta. Probá de nuevo.';
  }
  if (/email not confirmed/i.test(msg)) return 'Esa cuenta todavía no confirmó su email.';
  return 'Email o contraseña incorrectos.';
}

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState<'entrar' | 'crear-cuenta'>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    setEnviando(true);

    try {
      const supabase = crearClienteNavegador();
      const { data, error } =
        modo === 'entrar'
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (error) {
        setError(mensajeDeError(error, modo));
        setEnviando(false);
        return;
      }

      // Con la confirmación de email desactivada (docs/supuestos.md #19) el alta
      // ya deja sesión abierta. Si alguien la vuelve a activar, signUp devuelve
      // sesión nula: sin esto redirigiríamos a /esperando y el middleware, al no
      // ver usuario, rebotaría a /login sin explicar nada.
      if (!data.session) {
        setAviso('Te mandamos un email para confirmar la cuenta. Confirmala y volvé a entrar.');
        setEnviando(false);
        return;
      }

      router.push(modo === 'entrar' ? '/bandeja' : '/esperando');
      router.refresh();
    } catch {
      // supabase-js casi siempre devuelve el fallo en `error`, pero si la promesa
      // explota igual (red caída a mitad de camino) el formulario no puede quedar
      // trabado en "Un momento…" sin decir nada.
      setError('No pudimos conectarnos con el servidor. Revisá tu conexión y probá de nuevo.');
      setEnviando(false);
    }
  }

  return (
    <div className="flex w-[340px] flex-col items-center gap-6.5">
      <div className="flex flex-col items-center gap-4 text-center">
        <Image src="/logo-otto.png" alt="Otto Su Misura" width={88} height={88} className="rounded-pill" />
        <div>
          <div className="font-serif text-[30px] font-semibold tracking-[.02em]">Otto Su Misura</div>
          <div className="mt-1.5 text-[10px] font-semibold tracking-[.28em] text-grafito">
            MR OTTO · ROSARIO · DESDE 1968
          </div>
        </div>
      </div>
      <form onSubmit={onSubmit} className="flex w-full flex-col gap-3">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-otto border border-borde bg-lino px-3.5 py-3 text-[15px] outline-none"
        />
        <input
          placeholder="Contraseña"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-otto border border-borde bg-lino px-3.5 py-3 text-[15px] outline-none"
        />
        {error && <div className="text-sm text-ladrillo">{error}</div>}
        {aviso && <div className="text-sm text-grafito">{aviso}</div>}
        <button
          type="submit"
          disabled={enviando}
          className="rounded-otto bg-cobre py-3 text-[15px] font-medium text-lino disabled:opacity-60"
        >
          {enviando ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
        </button>
      </form>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setAviso(null);
          setModo((m) => (m === 'entrar' ? 'crear-cuenta' : 'entrar'));
        }}
        className="text-sm text-grafito underline"
      >
        {modo === 'entrar' ? 'Pedir acceso' : 'Ya tengo cuenta'}
      </button>
    </div>
  );
}
