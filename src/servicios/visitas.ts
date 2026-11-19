import * as Network from "expo-network";
import { OrigenVisita, RespuestaExito, Visita } from "../tipos";
import { API_URL, peticionApi } from "./api";
import { guardarFotoVisitaLocal } from "./archivos";
import {
  actualizarVisitaLocal,
  insertarVisitaLocal,
  listarVisitasLocales,
  marcarVisitaComoSincronizada,
  sincronizarEspejoVisitasLocal,
} from "./baseDatos";
import {
  esTokenRemotoApi,
  obtenerTokenSesion,
  obtenerUsuarioSesion,
} from "./seguridad";

// Sube primero la foto local a POST /archivos como exige la regla R13 de la API de la cátedra
async function subirFotoAlServidor(
  fotoUriLocal: string,
  token: string,
): Promise<string | null> {
  if (fotoUriLocal.startsWith("http://") || fotoUriLocal.startsWith("https://")) {
    return fotoUriLocal;
  }

  // 1. Intento nativo con File.upload (MULTIPART) de expo-file-system
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { File, UploadType } = require("expo-file-system") as typeof import("expo-file-system");
    const archivo = new File(fotoUriLocal);
    if (archivo.exists) {
      const resultado = await archivo.upload(`${API_URL}/archivos`, {
        httpMethod: "POST",
        uploadType: UploadType.MULTIPART,
        fieldName: "archivo",
        mimeType: "image/jpeg",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      if (resultado.status >= 200 && resultado.status < 300) {
        const json = JSON.parse(resultado.body) as RespuestaExito<{
          url: string;
        }>;
        if (json?.datos?.url) {
          return json.datos.url;
        }
      }
    }
  } catch {}

  // 2. Respaldo estándar con fetch y FormData
  try {
    const formData = new FormData();
    formData.append("archivo", {
      uri: fotoUriLocal,
      name: `visita-${Date.now()}.jpg`,
      type: "image/jpeg",
    } as unknown as Blob);

    const res = await fetch(`${API_URL}/archivos`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body: formData,
    });

    if (!res.ok) {
      return null;
    }

    const json = (await res.json()) as RespuestaExito<{ url: string }>;
    return json.datos.url;
  } catch {
    return null;
  }
}

// Opción A: Sin cuenta iniciada, la lista de recorrido está vacía ("La cuenta es para guardar cosas")
export async function obtenerMisVisitas(): Promise<RespuestaExito<Visita[]>> {
  const token = await obtenerTokenSesion();
  if (!token) {
    return {
      datos: [],
      meta: { total: 0, pagina: 1, porPagina: 200 },
    };
  }
  const usuario = await obtenerUsuarioSesion();
  const uid = usuario?.id || "usr-201";

  const locales = await listarVisitasLocales(uid);
  if (esTokenRemotoApi(token)) {
    try {
      const remotas = await peticionApi<Visita[]>(
        "/yo/visitas?porPagina=200",
        {},
        token,
      );
      const mapaLocales = new Map(locales.map((v) => [v.id, v]));

      // Si alguna visita ya subida al servidor quedó sin foto remota pero tiene foto local en el teléfono, la preservamos y la subimos en segundo plano
      const remotasEnriquecidas = remotas.datos.map((remota) => {
        const local = mapaLocales.get(remota.id);
        if (!remota.fotoUri && local?.fotoUri) {
          void (async () => {
            const urlSubida = await subirFotoAlServidor(local.fotoUri!, token);
            if (urlSubida) {
              await peticionApi<Visita>(
                `/yo/visitas/${remota.id}`,
                {
                  method: "PATCH",
                  body: JSON.stringify({ fotoUri: urlSubida }),
                },
                token,
              ).catch(() => {});
            }
          })();
          return { ...remota, fotoUri: local.fotoUri };
        }
        return remota;
      });

      await sincronizarEspejoVisitasLocal(remotasEnriquecidas, uid);
      const espejoActualizado = await listarVisitasLocales(uid);
      return {
        datos: espejoActualizado,
        meta: {
          total: espejoActualizado.length,
          pagina: 1,
          porPagina: 200,
        },
      };
    } catch {}
  }

  return {
    datos: locales,
    meta: { total: locales.length, pagina: 1, porPagina: 200 },
  };
}

export interface DatosNuevaVisita {
  lugarId: string;
  origen: OrigenVisita;
  fotoUri: string | null;
  nota: string | null;
  usuarioId?: string;
}

export async function registrarNuevaVisita(
  datos: DatosNuevaVisita,
): Promise<Visita> {
  const token = await obtenerTokenSesion();
  if (!token) {
    throw new Error("Tenés que ingresar con tu cuenta para hacer esto.");
  }
  const usuario = await obtenerUsuarioSesion();
  const id = `vis-${Date.now()}`;
  let fotoPersistente: string | null = null;

  if (datos.fotoUri) {
    fotoPersistente = await guardarFotoVisitaLocal(datos.fotoUri, id);
  }

  const nuevaVisita: Visita = {
    id,
    usuarioId: datos.usuarioId || usuario?.id || "usr-201",
    lugarId: datos.lugarId,
    fechaHora: new Date().toISOString(),
    origen: datos.origen,
    fotoUri: fotoPersistente,
    nota: datos.nota && datos.nota.trim().length > 0 ? datos.nota.trim() : null,
    sincronizada: false,
  };

  // Se guarda primero en el teléfono con sincronizada: false (PDF pág. 12)
  await insertarVisitaLocal(nuevaVisita);

  // Si hay señal y sesión activa, sincroniza contra POST /yo/visitas de la API de la cátedra
  try {
    const red = await Network.getNetworkStateAsync();
    const token = await obtenerTokenSesion();
    if (
      red.isConnected &&
      red.isInternetReachable !== false &&
      esTokenRemotoApi(token)
    ) {
      let urlFotoRemota: string | null = null;
      if (nuevaVisita.fotoUri) {
        urlFotoRemota = await subirFotoAlServidor(nuevaVisita.fotoUri, token);
        // Si el usuario adjuntó foto pero la subida a /archivos falló, dejamos la visita pendiente en la cola local para no perder la foto
        if (!urlFotoRemota) {
          return nuevaVisita;
        }
      }

      await peticionApi<Visita>(
        "/yo/visitas",
        {
          method: "POST",
          body: JSON.stringify({
            id: nuevaVisita.id,
            lugarId: nuevaVisita.lugarId,
            fechaHora: nuevaVisita.fechaHora,
            origen: nuevaVisita.origen,
            fotoUri: urlFotoRemota,
            nota: nuevaVisita.nota,
          }),
        },
        token,
      );
      await marcarVisitaComoSincronizada(nuevaVisita.id);
      nuevaVisita.sincronizada = true;
    }
  } catch {
    // Queda en la cola local con sincronizada: false para subir cuando vuelva la conexión
  }

  return nuevaVisita;
}

export async function sincronizarVisitasPendientes(): Promise<{
  sincronizadasAhora: number;
  pendientesRestantes: number;
}> {
  const estadoRed = await Network.getNetworkStateAsync();
  if (!estadoRed.isConnected) {
    throw new Error(
      "Sin conexión de red. Tus visitas siguen guardadas en el teléfono.",
    );
  }

  const token = await obtenerTokenSesion();
  if (!esTokenRemotoApi(token)) {
    throw new Error(
      "Iniciá sesión con conexión a la API en la pestaña 'Yo' (ej. lucia@mail.com) para respaldar tus visitas en el servidor.",
    );
  }
  const usuario = await obtenerUsuarioSesion();
  const todas = await listarVisitasLocales(usuario?.id);
  const pendientes = todas.filter((v) => !v.sincronizada);
  let sincronizadasAhora = 0;
  let ultimoError: string | null = null;

  for (const visita of pendientes) {
    try {
      let urlFotoRemota: string | null = null;
      if (visita.fotoUri) {
        urlFotoRemota = await subirFotoAlServidor(visita.fotoUri, token);
        if (!urlFotoRemota) {
          throw new Error("No se pudo subir la fotografía a POST /archivos.");
        }
      }
      await peticionApi<Visita>(
        "/yo/visitas",
        {
          method: "POST",
          body: JSON.stringify({
            id: visita.id,
            lugarId: visita.lugarId,
            fechaHora: visita.fechaHora,
            origen: visita.origen,
            fotoUri: urlFotoRemota,
            nota: visita.nota,
          }),
        },
        token,
      );
      await marcarVisitaComoSincronizada(visita.id);
      sincronizadasAhora++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // Si el servidor responde 409 ID_EN_USO ("Ese identificador ya está en uso"), ya estaba subida
      if (msg.toLowerCase().includes("en uso")) {
        await marcarVisitaComoSincronizada(visita.id);
        sincronizadasAhora++;
      } else {
        ultimoError = msg || "No se pudo conectar con la API.";
      }
    }
  }

  const actualizadas = await listarVisitasLocales(usuario?.id);
  const pendientesRestantes = actualizadas.filter((v) => !v.sincronizada).length;

  if (pendientes.length > 0 && sincronizadasAhora === 0 && ultimoError) {
    throw new Error(ultimoError);
  }

  return { sincronizadasAhora, pendientesRestantes };
}

// Permite agregar o editar la foto o la nota de una visita ya registrada (PATCH /yo/visitas/:id)
export async function actualizarVisitaExistente(
  visitaId: string,
  cambios: { fotoUri?: string | null; nota?: string | null },
): Promise<void> {
  let fotoPersistente = cambios.fotoUri;
  if (
    cambios.fotoUri &&
    !cambios.fotoUri.startsWith("http://") &&
    !cambios.fotoUri.startsWith("https://")
  ) {
    fotoPersistente = await guardarFotoVisitaLocal(cambios.fotoUri, visitaId);
  }

  const notaLimpia =
    cambios.nota !== undefined
      ? cambios.nota && cambios.nota.trim().length > 0
        ? cambios.nota.trim()
        : null
      : undefined;

  await actualizarVisitaLocal(visitaId, {
    fotoUri: fotoPersistente,
    nota: notaLimpia,
  });

  const token = await obtenerTokenSesion();
  if (esTokenRemotoApi(token)) {
    try {
      const cuerpoPatch: Record<string, string | null> = {};
      if (notaLimpia !== undefined) {
        cuerpoPatch.nota = notaLimpia;
      }
      if (fotoPersistente !== undefined) {
        if (fotoPersistente) {
          const urlRemota = await subirFotoAlServidor(fotoPersistente, token);
          if (urlRemota) {
            cuerpoPatch.fotoUri = urlRemota;
          }
        } else {
          cuerpoPatch.fotoUri = null;
        }
      }

      if (Object.keys(cuerpoPatch).length > 0) {
        await peticionApi<Visita>(
          `/yo/visitas/${visitaId}`,
          {
            method: "PATCH",
            body: JSON.stringify(cuerpoPatch),
          },
          token,
        );
      }
    } catch {}
  }
}
