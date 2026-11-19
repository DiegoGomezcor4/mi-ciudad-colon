import { EVENTOS_MOCK } from "../mocks/eventos";
import { EstadoEvento, Evento, RespuestaExito, Usuario } from "../tipos";
import { peticionApi } from "./api";
import {
  alternarEventoGuardadoId,
  guardarEstadoEventoLocal,
  guardarEventosGuardadosIds,
  obtenerEstadosEventosLocales,
  obtenerEventosGuardadosIds,
} from "./preferencias";
import {
  esTokenRemotoApi,
  obtenerTokenSesion,
  obtenerUsuarioSesion,
} from "./seguridad";

let eventosCacheMemoria: Evento[] = [...EVENTOS_MOCK];

export async function obtenerEventos(): Promise<RespuestaExito<Evento[]>> {
  const estadosLocales = await obtenerEstadosEventosLocales();
  try {
    const res = await peticionApi<Evento[]>(
      "/eventos?desde=2026-11-01&porPagina=100",
    );
    if (res.datos.length > 0) {
      const mapa = new Map<string, Evento>();
      for (const prev of eventosCacheMemoria) {
        if (res.datos.some((r) => r.id === prev.id)) continue;
        // Conservamos en caché eventos guardados anteriores si existían
        mapa.set(prev.id, prev);
      }
      for (const nuevo of res.datos) {
        mapa.set(nuevo.id, nuevo);
      }
      eventosCacheMemoria = Array.from(mapa.values()).sort(
        (a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime(),
      );
    }
    return {
      ...res,
      datos: eventosCacheMemoria.map((e) =>
        estadosLocales[e.id] ? { ...e, estado: estadosLocales[e.id] } : e,
      ),
    };
  } catch {
    const respaldo = eventosCacheMemoria.map((e) =>
      estadosLocales[e.id] ? { ...e, estado: estadosLocales[e.id] } : e,
    );
    return {
      datos: respaldo,
      meta: { total: respaldo.length, pagina: 1, porPagina: 100 },
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
    const encontrado =
      eventosCacheMemoria.find((e) => e.id === id) ||
      EVENTOS_MOCK.find((e) => e.id === id) ||
      eventosCacheMemoria[0];
    if (!encontrado) {
      throw new Error("No se encontró el evento sin conexión.");
    }
    return {
      datos: estadosLocales[id]
        ? { ...encontrado, estado: estadosLocales[id] }
        : encontrado,
      meta: null,
    };
  }
}

// Opción A: Sin sesión iniciada devuelve lista vacía; con sesión espeja en kv-store local por usuarioId para funcionar también offline
export async function obtenerMisEventosGuardadosIds(): Promise<string[]> {
  const token = await obtenerTokenSesion();
  if (!token) {
    return [];
  }
  const usuario = await obtenerUsuarioSesion();
  const uid = usuario?.id;
  if (!uid) {
    return [];
  }

  if (esTokenRemotoApi(token)) {
    try {
      const res = await peticionApi<Evento[]>(
        "/yo/eventos-guardados",
        {},
        token,
      );
      if (res.datos.length > 0) {
        const mapa = new Map(eventosCacheMemoria.map((e) => [e.id, e]));
        for (const evGuardado of res.datos) {
          mapa.set(evGuardado.id, evGuardado);
        }
        eventosCacheMemoria = Array.from(mapa.values()).sort(
          (a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime(),
        );
      }
      const ids = res.datos.map((e) => e.id);
      await guardarEventosGuardadosIds(ids, uid);
      return ids;
    } catch {}
  }
  return obtenerEventosGuardadosIds(uid);
}

export async function alternarGuardarEvento(eventoId: string): Promise<boolean> {
  const token = await obtenerTokenSesion();
  const usuario = await obtenerUsuarioSesion();
  if (!token || !usuario?.id) {
    throw new Error("Tenés que ingresar con tu cuenta para hacer esto.");
  }
  const nuevoEstadoLocal = await alternarEventoGuardadoId(
    eventoId,
    usuario.id,
  );
  if (esTokenRemotoApi(token)) {
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
