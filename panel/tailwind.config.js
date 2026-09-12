/** @type {import('tailwindcss').Config} */
// Tokens tal como vienen de DISENO.md / otto-tokens.tailwind.js (sección TOKENS
// del canvas de Claude Design). No inventar variantes acá: los colores que no
// están nombrados en esta paleta van como valor arbitrario de Tailwind
// (bg-[#EFEBE3]) directo en el componente, documentado en un comentario.
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        hueso: '#F6F3EE',
        lino: '#FFFFFF',
        borde: '#E6E1D8',
        'borde-suave': '#F0EBE2',
        tinta: '#171A1F',
        grafito: '#5C6068',
        cobre: { DEFAULT: '#A8703F', claro: '#F1E6D9', oscuro: '#8A5A30' },
        noche: { DEFAULT: '#1F2A3C', suave: '#EEF1F5' },
        salvia: { DEFAULT: '#5E7F62', suave: '#E7EFE7' },
        ambar: { DEFAULT: '#B8862B', suave: '#F7EFDD' },
        ladrillo: { DEFAULT: '#A6473A', suave: '#F6E3DF' },
      },
      fontFamily: {
        serif: ['var(--font-fraunces)', 'Cormorant Garamond', 'serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        otto: '8px',
        bloque: '6px',
        pill: '999px',
      },
      boxShadow: {
        otto: '0 1px 2px rgba(0,0,0,.06)',
        'otto-pop': '0 8px 24px rgba(23,26,31,.12)',
      },
      spacing: {
        fila: '56px',
        sidebar: '216px',
        lista: '360px',
        drawer: '400px',
      },
    },
  },
  plugins: [],
};
