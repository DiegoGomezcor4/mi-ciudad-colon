import { Favorito, Preferencias, RespuestaExito, Usuario } from "../tipos";
import { esErrorDeConexionApi, peticionApi } from "./api";
import {
  alternarFavoritoLocal,
  esLugarFavoritoLocal,
  listarFavoritosLocales,
  sincronizarEspejoFavoritosLocal,
} from "./baseDatos";
import {
  guardarPreferenciasLocales,
  marcarPreferenciasPendientesSync,
  obtenerPreferenciasDeUsuarioLocal,
  obtenerPreferenciasLocales,
  tienePreferenciasPendientesSync,
} from "./preferencias";
import {
  eliminarTokenSesion,
  esTokenRemotoApi,
  guardarTokenSesion,
  guardarUsuarioSesion,
  obtenerTokenSesion,
  obtenerUsuarioConocidoPorEmail,
  obtenerUsuarioSesion,
} from "./seguridad";

async function resolverUsuarioOfflinePorEmail(
  emailRaw: string,
  preferenciasRespaldo: Preferencias,
): Promise<Usuario> {
  const email = emailRaw.trim().toLowerCase();
  const idDeterministico =
    email === "nuevo@demo.ar"
      ? "usr-nuevo"
      : email === "turismo@colon.demo.ar"
        ? "usr-turismo"
        : email === "lucia@mail.com"
          ? "usr-201"
          : `usr-${email}`;

  const conocido = await obtenerUsuarioConocidoPorEmail(emailRaw);
  const uid = conocido?.id || idDeterministico;
  const prefsGuardadasUsuario = await obtenerPreferenciasDeUsuarioLocal(uid);

  if (conocido) {
    return {
      ...conocido,
      preferencias: prefsGuardadasUsuario || conocido.preferencias,
    };
  }

  if (email === "nuevo@demo.ar") {
    return {
      id: "usr-nuevo",
      nombre: "Turista Nuevo",
      email: "nuevo@demo.ar",
      avatarUrl: null,
      creadoEn: "2026-11-01T10:00:00-03:00",
      preferencias: prefsGuardadasUsuario || {
        categoriasFavoritas: [],
        avisarProximidad: true,
        radioAvisoMetros: 250,
        tema: "sistema",
      },
    };
  }
  if (email === "turismo@colon.demo.ar") {
    return {
      id: "usr-turismo",
      nombre: "Dirección de Turismo",
      email: "turismo@colon.demo.ar",
      avatarUrl: null,
      creadoEn: "2026-01-01T09:00:00-03:00",
      preferencias: prefsGuardadasUsuario || {
        categoriasFavoritas: [],
        avisarProximidad: false,
        radioAvisoMetros: 250,
        tema: "claro",
      },
    };
  }
  return {
    id: uid,
    nombre: email === "lucia@mail.com" ? "Lucía Méndez" : email.split("@")[0],
    email,
    avatarUrl: null,
    creadoEn: "2026-09-02T18:20:00-03:00",
    preferencias: prefsGuardadasUsuario || preferenciasRespaldo,
  };
}

// Usa POST /auth/ingreso de la API de la cátedra (y permite entrar con la caché local si la API está apagada)
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
    const uid = respuesta.datos.usuario.id;
    let usuarioFinal = respuesta.datos.usuario;

    // Si el usuario modificó sus preferencias en kv-store mientras estaba sin conexión, las conservamos y las subimos a la API
    if (await tienePreferenciasPendientesSync(uid)) {
      const prefsOffline = await obtenerPreferenciasDeUsuarioLocal(uid);
      if (prefsOffline) {
        usuarioFinal = { ...usuarioFinal, preferencias: prefsOffline };
        peticionApi<Usuario>(
          "/yo",
          {
            method: "PATCH",
            body: JSON.stringify({ preferencias: prefsOffline }),
          },
          respuesta.datos.token,
        )
          .then(() => marcarPreferenciasPendientesSync(uid, false))
          .catch(() => {});
      }
    }

    await guardarTokenSesion(respuesta.datos.token);
    await guardarUsuarioSesion(usuarioFinal);
    await guardarPreferenciasLocales(usuarioFinal.preferencias, uid);
    return { usuario: usuarioFinal, token: respuesta.datos.token };
  } catch (err) {
    if (!esErrorDeConexionApi(err)) {
      throw err;
    }

    const prefs = await obtenerPreferenciasLocales();
    const usuarioOffline = await resolverUsuarioOfflinePorEmail(email, prefs);
    const tokenOffline = `offline-sesion-${usuarioOffline.id}`;
    await guardarTokenSesion(tokenOffline);
    await guardarUsuarioSesion(usuarioOffline);
    await guardarPreferenciasLocales(
      usuarioOffline.preferencias,
      usuarioOffline.id,
    );
    return {
      usuario: usuarioOffline,
      token: tokenOffline,
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
  await guardarUsuarioSesion(respuesta.datos.usuario);
  await guardarPreferenciasLocales(
    respuesta.datos.usuario.preferencias,
    respuesta.datos.usuario.id,
  );
  return respuesta.datos;
}

export async function cerrarSesionUsuario(): Promise<void> {
  await eliminarTokenSesion();
}

// Usa GET /yo de la API de la cátedra (y mantiene la sesión y las preferencias kv-store si el teléfono queda sin señal)
export async function obtenerPerfilActual(): Promise<Usuario | null> {
  const token = await obtenerTokenSesion();
  if (!token) {
    return null;
  }
  const usuarioLocal = await obtenerUsuarioSesion();

  if (esTokenRemotoApi(token)) {
    try {
      const res = await peticionApi<Usuario>("/yo", {}, token);
      const uid = res.datos.id;

      // Si hay cambios de preferencias hechos offline, tienen prioridad sobre el servidor
      if (await tienePreferenciasPendientesSync(uid)) {
        const prefsOffline = await obtenerPreferenciasDeUsuarioLocal(uid);
        if (prefsOffline) {
          const actualizado = await peticionApi<Usuario>(
            "/yo",
            {
              method: "PATCH",
              body: JSON.stringify({ preferencias: prefsOffline }),
            },
            token,
          );
          await marcarPreferenciasPendientesSync(uid, false);
          await guardarUsuarioSesion(actualizado.datos);
          await guardarPreferenciasLocales(
            actualizado.datos.preferencias,
            uid,
          );
          return actualizado.datos;
        }
      }

      await guardarUsuarioSesion(res.datos);
      await guardarPreferenciasLocales(res.datos.preferencias, uid);
      return res.datos;
    } catch {
      if (usuarioLocal) {
        const prefsUser = await obtenerPreferenciasDeUsuarioLocal(
          usuarioLocal.id,
        );
        if (prefsUser) {
          return { ...usuarioLocal, preferencias: prefsUser };
        }
      }
      return usuarioLocal;
    }
  }

  if (usuarioLocal) {
    const prefsUser = await obtenerPreferenciasDeUsuarioLocal(usuarioLocal.id);
    if (prefsUser) {
      return { ...usuarioLocal, preferencias: prefsUser };
    }
  }
  return usuarioLocal;
}

// Guarda siempre en expo-sqlite/kv-store (con o sin conexión) y sincroniza con PATCH /yo cuando hay conexión
export async function actualizarPreferenciasUsuario(
  preferencias: Preferencias,
): Promise<Preferencias> {
  const usuarioActual = await obtenerUsuarioSesion();
  const uid = usuarioActual?.id;

  await guardarPreferenciasLocales(preferencias, uid);
  if (usuarioActual) {
    await guardarUsuarioSesion({ ...usuarioActual, preferencias });
  }

  const token = await obtenerTokenSesion();
  if (esTokenRemotoApi(token) && uid) {
    try {
      const res = await peticionApi<Usuario>(
        "/yo",
        {
          method: "PATCH",
          body: JSON.stringify({ preferencias }),
        },
        token,
      );
      await marcarPreferenciasPendientesSync(uid, false);
      await guardarUsuarioSesion(res.datos);
      await guardarPreferenciasLocales(res.datos.preferencias, uid);
      return res.datos.preferencias;
    } catch {
      await marcarPreferenciasPendientesSync(uid, true);
    }
  } else if (uid) {
    await marcarPreferenciasPendientesSync(uid, true);
  }
  return preferencias;
}

// Opción A: Sin cuenta iniciada, la lista de favoritos está vacía ("La cuenta es para guardar cosas")
export async function obtenerMisFavoritos(): Promise<
  RespuestaExito<Favorito[]>
> {
  const token = await obtenerTokenSesion();
  if (!token) {
    return {
      datos: [],
      meta: { total: 0, pagina: 1, porPagina: 50 },
    };
  }
  const usuario = await obtenerUsuarioSesion();
  const uid = usuario?.id || "usr-201";

  if (esTokenRemotoApi(token)) {
    try {
      const res = await peticionApi<Favorito[]>("/yo/favoritos", {}, token);
      await sincronizarEspejoFavoritosLocal(res.datos, uid);
      return res;
    } catch {}
  }

  const locales = await listarFavoritosLocales(uid);
  return {
    datos: locales,
    meta: { total: locales.length, pagina: 1, porPagina: 50 },
  };
}

export async function consultarSiEsFavorito(lugarId: string): Promise<boolean> {
  const token = await obtenerTokenSesion();
  if (!token) {
    return false;
  }
  const usuario = await obtenerUsuarioSesion();
  const uid = usuario?.id || "usr-201";

  if (esTokenRemotoApi(token)) {
    try {
      const res = await peticionApi<Favorito[]>("/yo/favoritos", {}, token);
      await sincronizarEspejoFavoritosLocal(res.datos, uid);
      return res.datos.some((f) => f.lugarId === lugarId);
    } catch {}
  }
  return esLugarFavoritoLocal(lugarId, uid);
}

// Exige sesión iniciada (código 401 NO_AUTENTICADO: "Tenés que ingresar con tu cuenta para hacer esto.")
export async function cambiarEstadoFavorito(lugarId: string): Promise<boolean> {
  const token = await obtenerTokenSesion();
  if (!token) {
    throw new Error("Tenés que ingresar con tu cuenta para hacer esto.");
  }
  const usuario = await obtenerUsuarioSesion();
  const uid = usuario?.id || "usr-201";
  const nuevoEstadoLocal = await alternarFavoritoLocal(lugarId, uid);

  if (esTokenRemotoApi(token)) {
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
