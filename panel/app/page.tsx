// Raíz: el middleware ya decidió quién llega (sin sesión → /login; perfil
// pendiente → /esperando). Acá solo se manda a la primera pestaña.
import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/bandeja');
}
