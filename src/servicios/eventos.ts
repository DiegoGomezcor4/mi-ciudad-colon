import { EVENTOS_MOCK } from "../mocks/eventos";
import { EstadoEvento, Evento, RespuestaExito, Usuario } from "../tipos";
import { peticionApi } from "./api";
import {
  alternarEventoGuardadoId,
  guardarEstadoEventoLocal,
  obtenerEstadosEventosLocales,
  obtenerEventosGuardadosIds,
} from "./preferencias";
import { obtenerTokenSesion } from "./seguridad";

export async function obtenerEventos(): Promise<RespuestaExito<Evento[]>> {
  const estadosLocales = await obtenerEstadosEventosLocales();
  try {
    const res = await peticionApi<Evento[]>("/eventos?porPagina=100");
    return {
      ...res,
      datos: res.datos.map((e) =>
        estadosLocales[e.id] ? { ...e, estado: estadosLocales[e.id] } : e,
      ),
    };
  } catch {
    const ordenados = [...EVENTOS_MOCK]
      .map((e) =>
        estadosLocales[e.id] ? { ...e, estado: estadosLocales[e.id] } : e,
      )
      .sort(
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
  const estadosLocales = await obtenerEstadosEventosLocales();
  try {
    const res = await peticionApi<Evento>(`/eventos/${id}`);
    return {
      ...res,
      datos: estadosLocales[id]
        ? { ...res.datos, estado: estadosLocales[id] }
        : res.datos,
    };
  } catch {
    const evento = EVENTOS_MOCK.find((e) => e.id === id);
    if (!evento) {
      throw new Error("No existe ese evento.");
    }
    return {
      datos: estadosLocales[id]
        ? { ...evento, estado: estadosLocales[id] }
        : evento,
      meta: null,
    };
  }
}

// Sincroniza con GET /yo/eventos-guardados, PUT /yo/eventos-guardados/:id y DELETE /yo/eventos-guardados/:id
export async function obtenerMisEventosGuardadosIds(): Promise<string[]> {
  const locales = await obtenerEventosGuardadosIds();
  const token = await obtenerTokenSesion();
  if (token && !token.startsWith("jwt-colon-")) {
    try {
      const res = await peticionApi<Evento[]>(
        "/yo/eventos-guardados",
        {},
        token,
      );
      const remotosIds = res.datos.map((e) => e.id);
      return Array.from(new Set([...remotosIds, ...locales]));
    } catch {}
  }
  return locales;
}

export async function alternarGuardarEvento(eventoId: string): Promise<boolean> {
  const nuevoEstadoLocal = await alternarEventoGuardadoId(eventoId);
  const token = await obtenerTokenSesion();
  if (token && !token.startsWith("jwt-colon-")) {
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

// Usa PATCH /eventos/:id/estado de la API de la cátedra y persiste localmente el cambio
export async function cambiarEstadoEventoApi(
  eventoId: string,
  estado: Exclude<EstadoEvento, "finalizado">,
): Promise<Evento | null> {
  await guardarEstadoEventoLocal(eventoId, estado);
  const token = await obtenerTokenSesion();

  if (token && !token.startsWith("jwt-colon-")) {
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
    } catch {}
  }

  // Si el usuario actual es turista o no inició sesión, usamos las credenciales demo de la Dirección de Turismo
  try {
    const sesionAdmin = await peticionApi<{ usuario: Usuario; token: string }>(
      "/auth/ingreso",
      {
        method: "POST",
        body: JSON.stringify({
          email: "turismo@colon.demo.ar",
          contrasena: "turismo1234",
        }),
      },
    );
    const res = await peticionApi<Evento>(
      `/eventos/${eventoId}/estado`,
      {
        method: "PATCH",
        body: JSON.stringify({ estado }),
      },
      sesionAdmin.datos.token,
    );
    return res.datos;
  } catch {
    return null;
  }
}
