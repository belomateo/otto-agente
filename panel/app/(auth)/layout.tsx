// Shell de las pantallas de autenticación: fondo hueso, todo centrado. Sin
// Sidebar ni Tabbar — antes de entrar no hay nada del panel que mostrar.

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center bg-hueso px-6">{children}</div>;
}
