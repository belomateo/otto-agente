// Raíz: sin sesión real todavía (H1.10 la conecta), así que entra directo al
// panel. Cuando "paneles" conecte Supabase Auth, esto pasa a chequear sesión
// y redirigir a /login cuando no haya.
import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/bandeja');
}
