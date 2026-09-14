'use client';

// Toast flotante: Toast.tsx con posición y tiempo. Abajo a la derecha en
// escritorio; en mobile, arriba de la barra inferior y a todo el ancho. Se va
// solo a los 8 s o al tocar la acción (casi siempre "Deshacer").

import { useCallback, useEffect, useState } from 'react';
import { Toast } from './Toast';

export type DatosToast = {
  texto: string;
  variante?: 'ok' | 'error';
  accion?: string;
  onAccion?: () => void;
};

type ToastActivo = DatosToast & { id: number };

export function useToast() {
  const [toast, setToast] = useState<ToastActivo | null>(null);
  const mostrar = useCallback((datos: DatosToast) => setToast({ ...datos, id: Date.now() }), []);
  const cerrar = useCallback(() => setToast(null), []);
  return { toast, mostrar, cerrar };
}

export function ToastFlotante({ toast, onCerrar }: { toast: ToastActivo | null; onCerrar: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const reloj = setTimeout(onCerrar, 8000);
    return () => clearTimeout(reloj);
  }, [toast, onCerrar]);

  if (!toast) return null;
  return (
    <div className="fixed inset-x-4 bottom-20 z-40 md:inset-x-auto md:bottom-6 md:right-7 md:max-w-[480px]">
      <Toast
        variante={toast.variante}
        texto={toast.texto}
        accion={toast.accion ?? 'Deshacer'}
        onAccion={() => {
          toast.onAccion?.();
          onCerrar();
        }}
      />
    </div>
  );
}
