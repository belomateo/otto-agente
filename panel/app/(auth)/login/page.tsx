// Login + registro abierto (CLAUDE.md § 1: "El dueño edita sin programador",
// registro abierto pero el perfil nace pendiente — TRABAJO.md H1.10). El molde
// visual es el de Claude Design (d-login.html); esto le suma la lógica real de
// Supabase Auth encima.
'use client';

import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
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

// Igual que en Configuración › Accesos: en la base es 'admin'/'equipo', acá se muestra
// "Administrador"/"Colaborador" — la traducción es solo de pantalla.
type RolPedido = 'equipo' | 'admin';
const ETIQUETA_ROL: Record<RolPedido, string> = { equipo: 'Colaborador', admin: 'Administrador' };

// useSearchParams() saca a la página del prerenderizado estático salvo que esté dentro de un
// Suspense (Next.js App Router): sin esto, `next build` falla al armar /login como página
// estática — typecheck no lo agarra, solo el build real.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInterior />
    </Suspense>
  );
}

function LoginPageInterior() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Link del mail de invitación (paneles, H1.10): .../login?modo=crear-cuenta&email=<email> —
  // arranca directo en el registro con el mail ya cargado, un solo paso en vez de pedir
  // acceso a mano y volver a escribir el mail. Solo se lee una vez, al montar: de ahí en más
  // `modo`/`email` son estado normal, no quedan atados a la URL.
  const [modo, setModo] = useState<'entrar' | 'crear-cuenta'>(() => (searchParams.get('modo') === 'crear-cuenta' ? 'crear-cuenta' : 'entrar'));
  const [email, setEmail] = useState(() => searchParams.get('email') ?? '');
  // El mail queda bloqueado mientras venga de la invitación: si se pudiera cambiar, el alta no
  // engancharía con la invitación (queda como solicitud pendiente normal) y nadie entendería
  // por qué no entró directo. "¿no sos vos?" lo desbloquea a mano.
  const [emailBloqueado, setEmailBloqueado] = useState(() => Boolean(searchParams.get('email')));
  const [password, setPassword] = useState('');
  const [rolSolicitado, setRolSolicitado] = useState<RolPedido>('equipo');
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
          : await supabase.auth.signUp({ email, password, options: { data: { rol_solicitado: rolSolicitado } } });

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
          readOnly={emailBloqueado}
          className={`rounded-otto border border-borde px-3.5 py-3 text-[15px] outline-none ${emailBloqueado ? 'bg-hueso text-grafito' : 'bg-lino'}`}
        />
        {emailBloqueado && (
          <div className="-mt-1.5 flex items-center justify-between text-[13px] text-grafito">
            <span>Te invitaron con este mail</span>
            <button
              type="button"
              onClick={() => {
                setEmailBloqueado(false);
                setEmail('');
                router.replace('/login?modo=crear-cuenta');
              }}
              className="underline"
            >
              ¿No sos vos?
            </button>
          </div>
        )}
        <input
          placeholder="Contraseña"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-otto border border-borde bg-lino px-3.5 py-3 text-[15px] outline-none"
        />
        {/* Con el mail precargado por una invitación ya está todo decidido (el rol lo puso
            quien invitó): el trigger ni mira rol_solicitado en ese caso, así que preguntarlo
            de nuevo sería una elección que no hace nada. */}
        {modo === 'crear-cuenta' && !emailBloqueado && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-grafito" htmlFor="rol-pedido">
              ¿Con qué rol querés entrar?
            </label>
            <select
              id="rol-pedido"
              value={rolSolicitado}
              onChange={(e) => setRolSolicitado(e.target.value as RolPedido)}
              className="rounded-otto border border-borde bg-lino px-3.5 py-3 text-[15px] outline-none"
            >
              <option value="equipo">{ETIQUETA_ROL.equipo}</option>
              <option value="admin">{ETIQUETA_ROL.admin}</option>
            </select>
            {rolSolicitado === 'admin' && (
              <div className="text-[13px] leading-[1.4] text-grafito">
                Pedir Administrador no te lo da automático: lo aprueba alguien que ya es admin. Mientras tanto tu cuenta queda esperando aprobación, igual que hoy.
              </div>
            )}
          </div>
        )}
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
          setRolSolicitado('equipo');
          setModo((m) => (m === 'entrar' ? 'crear-cuenta' : 'entrar'));
        }}
        className="text-sm text-grafito underline"
      >
        {modo === 'entrar' ? 'Pedir acceso' : 'Ya tengo cuenta'}
      </button>
    </div>
  );
}
