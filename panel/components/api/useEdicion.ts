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

  /**
   * `cambios` es lo que espera el servidor (las columnas de la entidad), que no siempre es
   * igual a la forma del borrador en pantalla (por ejemplo, talles como texto separado por
   * comas acá y como array allá): por eso no se tipa como `Partial<T>`. Si la fila que
   * devuelve el servidor tampoco es exactamente `T` (mismo caso: la fila real trae `talles`,
   * no `talles_texto`), `mapear` arma el borrador de nuevo a partir de esa fila; si no se
   * pasa, se asume que la fila ya tiene la forma de `T`.
   */
  async function guardar(ruta: string, cambios: Record<string, unknown>, mapear?: (filaCruda: unknown) => T): Promise<string | null> {
    setGuardando(true);
    try {
      const { fila } = await enviar<{ fila: unknown }>(ruta, 'PATCH', { version: guardado.version, ...cambios });
      const nuevo = mapear ? mapear(fila) : (fila as T);
      setGuardado(nuevo);
      setValor(nuevo);
      return null;
    } catch (e) {
      return e instanceof ErrorApi ? e.message : 'No se pudo guardar';
    } finally {
      setGuardando(false);
    }
  }

  return { valor, setValor, guardado, sucio, guardando, guardar, deshacer, reemplazar };
}
