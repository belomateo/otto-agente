'use client';

// Sondeo de GET /api/turnos/por-avisar (H1.16, paneles) cada 20 s (dentro del "30 s o menos"
// que pidió Mateo, decisión #10 del 15/9). Ver docs/hitos/1.17-cartel-turno.md § Contrato.
//
// Mientras esa ruta no exista, NO se intenta: un fetch a una ruta que todavía no existe
// devuelve 404 y Chrome loguea ese fallo en la consola sin que el try/catch de JS pueda
// evitarlo, así que probar igual rompería la barra de "0 errores" en cada pantalla del panel
// (H1.1 punto 5) mientras 1.16 no esté lista. La bandera `NEXT_PUBLIC_TURNOS_POR_AVISAR=1`
// (la pone paneles en su panel/.env.example / panel/.env.local, no acá) es la señal de que la
// ruta ya existe; sin ella el cartel corre siempre en modo mock, sin red de por medio.

import { useCallback, useEffect, useRef, useState } from 'react';
import { desdeCrudo, type TurnoPorAvisar, type TurnoPorAvisarCrudo } from './tipos';
import { turnosMock } from './mock';

const HAY_ENDPOINT_REAL = process.env.NEXT_PUBLIC_TURNOS_POR_AVISAR === '1';
const SONDEO_MS = 20_000;

export function useTurnosPorAvisar() {
  const [turnos, setTurnos] = useState<TurnoPorAvisar[]>([]);
  const [modoMock, setModoMock] = useState(!HAY_ENDPOINT_REAL);
  // Ids cerrados con OK en modo mock: no hay backend que los saque de la lista, así que se
  // recuerdan acá para que no vuelvan a aparecer en el próximo sondeo mientras el panel siga
  // abierto (el hook vive en panel/app/(panel)/layout.tsx, que no se remonta al navegar).
  const cerradosMock = useRef<Set<string>>(new Set());

  const sondear = useCallback(async () => {
    if (!HAY_ENDPOINT_REAL) {
      setTurnos(turnosMock(new Date()).filter((t) => !cerradosMock.current.has(t.id)));
      return;
    }
    try {
      const r = await fetch('/api/turnos/por-avisar', { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const crudos: TurnoPorAvisarCrudo[] = await r.json();
      setModoMock(false);
      setTurnos(crudos.map(desdeCrudo));
    } catch {
      // La bandera dice que 1.16 ya existe pero este pedido puntual falló (red, 500 pasajero):
      // se cae al mock por esta vuelta y el próximo sondeo reintenta solo.
      setModoMock(true);
      setTurnos(turnosMock(new Date()).filter((t) => !cerradosMock.current.has(t.id)));
    }
  }, []);

  useEffect(() => {
    sondear();
    const id = setInterval(sondear, SONDEO_MS);
    return () => clearInterval(id);
  }, [sondear]);

  const marcarOk = useCallback(
    (id: string) => {
      setTurnos((actuales) => actuales.filter((t) => t.id !== id));
      if (modoMock) {
        cerradosMock.current.add(id);
        return;
      }
      // Sin credenciales explícitas: same-origin ya manda la cookie de sesión, de donde el
      // servidor saca el email de aviso_ok_por / confirmado_por (igual que el resto del panel).
      fetch(`/api/turnos/${id}/aviso-ok`, { method: 'POST' }).catch(() => {
        // Si falló, el próximo sondeo lo trae de vuelta porque aviso_ok_at siguió vacío:
        // no hace falta reintentar acá.
      });
    },
    [modoMock],
  );

  return { turnos, modoMock, marcarOk };
}
