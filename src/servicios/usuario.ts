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
    return respuesta.datos;
  } catch (err) {
    // Si la API respondió un error de credenciales (401), lo propagamos tal cual
    if (
      err instanceof Error &&
      err.message.toLowerCase().includes("contraseña")
    ) {
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

// Usa GET /yo/favoritos si hay sesión activa, con respaldo en SQLite local
export async function obtenerMisFavoritos(): Promise<
  RespuestaExito<Favorito[]>
> {
  const token = await obtenerTokenSesion();
  if (token) {
    try {
      return await peticionApi<Favorito[]>("/yo/favoritos", {}, token);
    } catch {}
  }
  const locales = await listarFavoritosLocales();
  return {
    datos: locales,
    meta: { total: locales.length, pagina: 1, porPagina: 50 },
  };
}

export async function consultarSiEsFavorito(lugarId: string): Promise<boolean> {
  const token = await obtenerTokenSesion();
  if (token) {
    try {
      const res = await peticionApi<Favorito[]>("/yo/favoritos", {}, token);
      return res.datos.some((f) => f.lugarId === lugarId);
    } catch {}
  }
  return esLugarFavoritoLocal(lugarId);
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
