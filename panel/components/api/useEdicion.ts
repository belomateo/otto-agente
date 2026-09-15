'use client';

// Edición del dueño contra panel/app/api/** (H1.9, paneles): PATCH { version, ...cambios }.
// El control de versión lo hace el servidor (409 si alguien más editó mientras tanto); acá
// solo se manda la versión que el borrador tiene en pantalla. Guardar es async: mientras está
// en curso no debería volver a tocarse Guardar (el llamador lo controla con `guardando`); si
// falla, el borrador queda como estaba, nada se pierde, y se puede reintentar o Deshacer.

import { useState } from 'react';
import { enviar, ErrorApi } from './cliente';

export function useEdicion<T extends { version: number }>(inicial: T) {
  const [guardado, setGuardado] = useState(inicial);
  const [valor, setValor] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const sucio = JSON.stringify(valor) !== JSON.stringify(guardado);

  function deshacer() {
    setValor(guardado);
  }

  /** Cuando llegan datos frescos del servidor (otra pestaña los cambió, o se volvió a esta
   * pantalla) y no hay una edición local sin guardar, se sincroniza; si hay una en curso, se
   * respeta lo que la persona está escribiendo. */
  function reemplazar(nuevo: T) {
    if (sucio) return;
    setGuardado(nuevo);
    setValor(nuevo);
  }

  async function guardar(ruta: string, cambios: Partial<T>): Promise<string | null> {
    setGuardando(true);
    try {
      const { fila } = await enviar<{ fila: T }>(ruta, 'PATCH', { version: guardado.version, ...cambios });
      setGuardado(fila);
      setValor(fila);
      return null;
    } catch (e) {
      return e instanceof ErrorApi ? e.message : 'No se pudo guardar';
    } finally {
      setGuardando(false);
    }
  }

  return { valor, setValor, guardado, sucio, guardando, guardar, deshacer, reemplazar };
}
