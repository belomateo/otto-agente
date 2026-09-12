// Íconos de línea del nav, calcados 1:1 de Sidebar.dc.html / TabbarMobile.dc.html
// (viewBox 18x18, stroke-width 1.5, currentColor). No usar una librería de
// íconos acá: son parte de la identidad visual definida en DISENO.md.

export function IconBandeja(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2" y="3.5" width="14" height="11.5" rx="2" />
      <path d="M2 10h4l1.5 2.5h3L12 10h4" />
    </svg>
  );
}

export function IconAtencion(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" {...props}>
      <circle cx="9" cy="6" r="3" />
      <path d="M3 15.5c1.4-3 3.8-4.2 6-4.2s4.6 1.2 6 4.2" />
    </svg>
  );
}

export function IconTurnos(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" {...props}>
      <rect x="2.5" y="3.5" width="13" height="12" rx="2" />
      <path d="M2.5 7.5h13M6 2v3M12 2v3" />
    </svg>
  );
}

export function IconClientes(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" {...props}>
      <circle cx="6.5" cy="6.5" r="2.5" />
      <path d="M2 15c1-2.5 2.7-3.7 4.5-3.7S10 12.5 11 15" />
      <circle cx="12.5" cy="6" r="2" />
      <path d="M12.5 11.3c2 .3 3 1.7 3.7 3.7" />
    </svg>
  );
}

export function IconConocimiento(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3.5 3.5h11v12h-9a2 2 0 0 1-2-2v-10z" />
      <path d="M6.5 3.5v12" />
    </svg>
  );
}

export function IconCatalogo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1" />
      <rect x="10" y="2.5" width="5.5" height="5.5" rx="1" />
      <rect x="2.5" y="10" width="5.5" height="5.5" rx="1" />
      <rect x="10" y="10" width="5.5" height="5.5" rx="1" />
    </svg>
  );
}

export function IconEstadisticas(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M2 9.5h3l2-4.5 3 8 2-4.5h4" />
    </svg>
  );
}

export function IconConfiguracion(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" {...props}>
      <path d="M3 5.5h12M3 12.5h12" />
      <circle cx="7" cy="5.5" r="1.8" fill="#FFFFFF" />
      <circle cx="11.5" cy="12.5" r="1.8" fill="#FFFFFF" />
    </svg>
  );
}

export function IconMas(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" {...props}>
      <circle cx="4" cy="9" r="1" />
      <circle cx="9" cy="9" r="1" />
      <circle cx="14" cy="9" r="1" />
    </svg>
  );
}

export function IconFoto(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2.5" y="3.5" width="13" height="11" rx="2" />
      <circle cx="6.3" cy="7" r="1.2" />
      <path d="M2.5 12.5 7 9l3 2.5 2.5-2 3 3" />
    </svg>
  );
}

export function IconAudio(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" {...props}>
      <rect x="6.8" y="2" width="4.4" height="8.5" rx="2.2" />
      <path d="M4 8.8a5 5 0 0 0 10 0M9 13.8V16" />
    </svg>
  );
}

export const NAV_ICONS: Record<string, (props: React.SVGProps<SVGSVGElement>) => React.ReactElement> = {
  bandeja: IconBandeja,
  atencion: IconAtencion,
  turnos: IconTurnos,
  clientes: IconClientes,
  conocimiento: IconConocimiento,
  catalogo: IconCatalogo,
  estadisticas: IconEstadisticas,
  configuracion: IconConfiguracion,
};
