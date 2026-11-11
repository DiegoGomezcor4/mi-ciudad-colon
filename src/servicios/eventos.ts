import { EVENTOS_MOCK } from "../mocks/eventos";
import { EstadoEvento, Evento, RespuestaExito } from "../tipos";
import { peticionApi } from "./api";
import {
  alternarEventoGuardadoId,
  obtenerEventosGuardadosIds,
} from "./preferencias";
import { obtenerTokenSesion } from "./seguridad";

export async function obtenerEventos(): Promise<RespuestaExito<Evento[]>> {
  try {
    return await peticionApi<Evento[]>("/eventos");
  } catch {
    const ordenados = [...EVENTOS_MOCK].sort(
      (a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime(),
    );
    return {
      datos: ordenados,
      meta: { total: ordenados.length, pagina: 1, porPagina: 20 },
    };
  }
}

export async function obtenerEventoPorId(
  id: string,
): Promise<RespuestaExito<Evento>> {
  try {
    return await peticionApi<Evento>(`/eventos/${id}`);
  } catch {
    const evento = EVENTOS_MOCK.find((e) => e.id === id);
    if (!evento) {
      throw new Error("No existe ese evento.");
    }
    return { datos: evento, meta: null };
  }
}

// Sincroniza con GET /yo/eventos-guardados, PUT /yo/eventos-guardados/:id y DELETE /yo/eventos-guardados/:id
export async function obtenerMisEventosGuardadosIds(): Promise<string[]> {
  const token = await obtenerTokenSesion();
  if (token) {
    try {
      const res = await peticionApi<Evento[]>(
        "/yo/eventos-guardados",
        {},
        token,
      );
      return res.datos.map((e) => e.id);
    } catch {}
  }
  return obtenerEventosGuardadosIds();
}

export async function alternarGuardarEvento(eventoId: string): Promise<boolean> {
  const nuevoEstadoLocal = await alternarEventoGuardadoId(eventoId);
  const token = await obtenerTokenSesion();
  if (token) {
    try {
      if (nuevoEstadoLocal) {
        await peticionApi<Evento>(
          `/yo/eventos-guardados/${eventoId}`,
          { method: "PUT" },
          token,
        );
      } else {
        await peticionApi<void>(
          `/yo/eventos-guardados/${eventoId}`,
          { method: "DELETE" },
          token,
        );
      }
    } catch {}
  }
  return nuevoEstadoLocal;
}

// Usa PATCH /eventos/:id/estado de la API de la cátedra (requiere cuenta admin turismo@colon.demo.ar)
export async function cambiarEstadoEventoApi(
  eventoId: string,
  estado: Exclude<EstadoEvento, "finalizado">,
): Promise<Evento | null> {
  const token = await obtenerTokenSesion();
  if (!token) {
    return null;
  }
  try {
    const res = await peticionApi<Evento>(
      `/eventos/${eventoId}/estado`,
      {
        method: "PATCH",
        body: JSON.stringify({ estado }),
      },
      token,
    );
    return res.datos;
  } catch {
    return null;
  }
}
