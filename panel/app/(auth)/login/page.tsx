// Login + registro abierto (CLAUDE.md § 1: "El dueño edita sin programador",
// registro abierto pero el perfil nace pendiente — TRABAJO.md H1.10). El molde
// visual es el de Claude Design (d-login.html); esto le suma la lógica real de
// Supabase Auth encima.
'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { crearClienteNavegador } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState<'entrar' | 'crear-cuenta'>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const supabase = crearClienteNavegador();

    if (modo === 'entrar') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError('Email o contraseña incorrectos.');
        setEnviando(false);
        return;
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message === 'User already registered' ? 'Ese email ya tiene una cuenta.' : 'No se pudo crear la cuenta.');
        setEnviando(false);
        return;
      }
    }

    router.push(modo === 'entrar' ? '/bandeja' : '/esperando');
    router.refresh();
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
          setModo((m) => (m === 'entrar' ? 'crear-cuenta' : 'entrar'));
        }}
        className="text-sm text-grafito underline"
      >
        {modo === 'entrar' ? 'Pedir acceso' : 'Ya tengo cuenta'}
      </button>
    </div>
  );
}
