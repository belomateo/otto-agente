import type { Metadata } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';

// Fraunces (display, serif) + Inter (cuerpo, sans) — ver DISENO.md § tipografía.
// Fraunces solo para títulos y números; nunca en cuerpo de texto largo.
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-fraunces',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Panel de Lucía — Otto Su Misura',
  description: 'Panel de gestión de Lucía, la asistente de WhatsApp de Otto Su Misura.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${fraunces.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
