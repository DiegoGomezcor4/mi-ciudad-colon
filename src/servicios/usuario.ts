import { USUARIO_MOCK } from "../mocks/usuario";
import { Favorito, Preferencias, RespuestaExito, Usuario } from "../tipos";
import { peticionApi } from "./api";
import {
  alternarFavoritoLocal,
  esLugarFavoritoLocal,
  listarFavoritosLocales,
} from "./baseDatos";
import {
  guardarPreferenciasLocales,
  obtenerPreferenciasLocales,
} from "./preferencias";
import {
  eliminarTokenSesion,
  guardarTokenSesion,
  obtenerTokenSesion,
} from "./seguridad";

// Usa POST /auth/ingreso de la API de la cátedra (contract/api.ts: Sesion { token, usuario })
export async function iniciarSesionUsuario(
  email: string,
  contrasena: string,
): Promise<{ usuario: Usuario; token: string }> {
  try {
    const respuesta = await peticionApi<{ usuario: Usuario; token: string }>(
      "/auth/ingreso",
      {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), contrasena }),
      },
    );
    await guardarTokenSesion(respuesta.datos.token);
    await guardarPreferenciasLocales(respuesta.datos.usuario.preferencias);

    // Sincronizar favoritos guardados localmente antes de iniciar sesión
    const locales = await listarFavoritosLocales();
    for (const fav of locales) {
      peticionApi<Favorito>(
        `/yo/favoritos/${fav.lugarId}`,
        { method: "PUT" },
        respuesta.datos.token,
      ).catch(() => {});
    }

    return respuesta.datos;
  } catch (err) {
    const esFalloRed =
      err instanceof TypeError ||
      (err instanceof Error && err.name === "AbortError");
    if (!esFalloRed) {
      throw err;
    }

    const tokenSimulado = `jwt-colon-${Date.now()}`;
    await guardarTokenSesion(tokenSimulado);
    const prefs = await obtenerPreferenciasLocales();
    return {
      usuario: {
        ...USUARIO_MOCK,
        email: email.trim() || USUARIO_MOCK.email,
        preferencias: prefs,
      },
      token: tokenSimulado,
    };
  }
}

// Usa POST /auth/registro de la API de la cátedra para crear una cuenta nueva de turista
export async function registrarNuevoUsuario(
  nombre: string,
  email: string,
  contrasena: string,
): Promise<{ usuario: Usuario; token: string }> {
  const respuesta = await peticionApi<{ usuario: Usuario; token: string }>(
    "/auth/registro",
    {
      method: "POST",
      body: JSON.stringify({
        nombre: nombre.trim(),
        email: email.trim(),
        contrasena,
      }),
    },
  );
  await guardarTokenSesion(respuesta.datos.token);
  await guardarPreferenciasLocales(respuesta.datos.usuario.preferencias);
  return respuesta.datos;
}

export async function cerrarSesionUsuario(): Promise<void> {
  await eliminarTokenSesion();
}

// Usa GET /yo de la API de la cátedra
export async function obtenerPerfilActual(): Promise<Usuario | null> {
  const token = await obtenerTokenSesion();
  if (!token) {
    return null;
  }
  const prefs = await obtenerPreferenciasLocales();
  try {
    const res = await peticionApi<Usuario>("/yo", {}, token);
    await guardarPreferenciasLocales(res.datos.preferencias);
    return res.datos;
  } catch {
    return {
      ...USUARIO_MOCK,
      preferencias: prefs,
    };
  }
}

// Usa PATCH /yo con { preferencias } según la especificación de la cátedra (R18)
export async function actualizarPreferenciasUsuario(
  preferencias: Preferencias,
): Promise<Preferencias> {
  await guardarPreferenciasLocales(preferencias);
  const token = await obtenerTokenSesion();
  if (token) {
    try {
      const res = await peticionApi<Usuario>(
        "/yo",
        {
          method: "PATCH",
          body: JSON.stringify({ preferencias }),
        },
        token,
      );
      return res.datos.preferencias;
    } catch {}
  }
  return preferencias;
}

// Usa GET /yo/favoritos si hay sesión activa, fusionando con SQLite local
export async function obtenerMisFavoritos(): Promise<
  RespuestaExito<Favorito[]>
> {
  const locales = await listarFavoritosLocales();
  const token = await obtenerTokenSesion();
  if (token && !token.startsWith("jwt-colon-")) {
    try {
      const remotos = await peticionApi<Favorito[]>("/yo/favoritos", {}, token);
      const lugaresRemotos = new Set(remotos.datos.map((f) => f.lugarId));
      const soloLocales = locales.filter(
        (f) => !lugaresRemotos.has(f.lugarId),
      );
      const combinados = [...remotos.datos, ...soloLocales];
      return {
        datos: combinados,
        meta: { total: combinados.length, pagina: 1, porPagina: 50 },
      };
    } catch {}
  }
  return {
    datos: locales,
    meta: { total: locales.length, pagina: 1, porPagina: 50 },
  };
}

export async function consultarSiEsFavorito(lugarId: string): Promise<boolean> {
  const esLocal = await esLugarFavoritoLocal(lugarId);
  if (esLocal) return true;
  const token = await obtenerTokenSesion();
  if (token && !token.startsWith("jwt-colon-")) {
    try {
      const res = await peticionApi<Favorito[]>("/yo/favoritos", {}, token);
      return res.datos.some((f) => f.lugarId === lugarId);
    } catch {}
  }
  return false;
}

// Usa PUT /yo/favoritos/:lugarId y DELETE /yo/favoritos/:lugarId de la API de la cátedra
export async function cambiarEstadoFavorito(lugarId: string): Promise<boolean> {
  const nuevoEstadoLocal = await alternarFavoritoLocal(lugarId);
  const token = await obtenerTokenSesion();
  if (token) {
    try {
      if (nuevoEstadoLocal) {
        await peticionApi<Favorito>(
          `/yo/favoritos/${lugarId}`,
          { method: "PUT" },
          token,
        );
      } else {
        await peticionApi<void>(
          `/yo/favoritos/${lugarId}`,
          { method: "DELETE" },
          token,
        );
      }
    } catch {}
  }
  return nuevoEstadoLocal;
}
