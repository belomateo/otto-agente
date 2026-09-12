// Login. Puerto de d-login.html. La autenticación real (Supabase Auth) la
// conecta "paneles" en H1.10 — esto es el molde visual.

import Image from 'next/image';
import Link from 'next/link';

export default function LoginPage() {
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
      <div className="flex w-full flex-col gap-3">
        <input placeholder="Email" className="rounded-otto border border-borde bg-lino px-3.5 py-3 text-[15px] outline-none" />
        <input
          placeholder="Contraseña"
          type="password"
          className="rounded-otto border border-borde bg-lino px-3.5 py-3 text-[15px] outline-none"
        />
        <button className="rounded-otto bg-cobre py-3 text-[15px] font-medium text-lino">Entrar</button>
      </div>
      <Link href="/esperando" className="text-sm">
        Pedir acceso
      </Link>
    </div>
  );
}
