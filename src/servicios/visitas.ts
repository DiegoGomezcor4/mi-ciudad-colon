import * as Network from "expo-network";
import { OrigenVisita, RespuestaExito, Visita } from "../tipos";
import { API_URL, peticionApi } from "./api";
import { guardarFotoVisitaLocal } from "./archivos";
import {
  insertarVisitaLocal,
  listarVisitasLocales,
  marcarVisitaComoSincronizada,
} from "./baseDatos";
import { obtenerTokenSesion } from "./seguridad";

// Sube primero la foto local a POST /archivos como exige la regla R13 de la API de la cátedra
async function subirFotoAlServidor(
  fotoUriLocal: string,
  token: string,
): Promise<string | null> {
  if (fotoUriLocal.startsWith("http://") || fotoUriLocal.startsWith("https://")) {
    return fotoUriLocal;
  }

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

// Combina las visitas de GET /yo/visitas de la API con la cola local en SQLite (sincronizada: false)
export async function obtenerMisVisitas(): Promise<RespuestaExito<Visita[]>> {
  const locales = await listarVisitasLocales();
  const token = await obtenerTokenSesion();

  if (token) {
    try {
      const remotas = await peticionApi<Visita[]>("/yo/visitas", {}, token);
      const idsRemotos = new Set(remotas.datos.map((v) => v.id));
      const pendientesLocales = locales.filter(
        (v) => !v.sincronizada && !idsRemotos.has(v.id),
      );
      const combinadas = [...pendientesLocales, ...remotas.datos].sort(
        (a, b) =>
          new Date(b.fechaHora).getTime() - new Date(a.fechaHora).getTime(),
      );
      return {
        datos: combinadas,
        meta: { total: combinadas.length, pagina: 1, porPagina: 50 },
      };
    } catch {}
  }

  return {
    datos: locales,
    meta: { total: locales.length, pagina: 1, porPagina: 50 },
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
  const id = `vis-${Date.now()}`;
  let fotoPersistente: string | null = null;

  if (datos.fotoUri) {
    fotoPersistente = await guardarFotoVisitaLocal(datos.fotoUri, id);
  }

  const nuevaVisita: Visita = {
    id,
    usuarioId: datos.usuarioId || "usr-201",
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
    if (red.isConnected && red.isInternetReachable !== false && token) {
      let urlFotoRemota: string | null = null;
      if (nuevaVisita.fotoUri) {
        urlFotoRemota = await subirFotoAlServidor(nuevaVisita.fotoUri, token);
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

  const todas = await listarVisitasLocales();
  const pendientes = todas.filter((v) => !v.sincronizada);
  let sincronizadasAhora = 0;
  const token = await obtenerTokenSesion();

  for (const visita of pendientes) {
    try {
      if (token) {
        let urlFotoRemota: string | null = null;
        if (visita.fotoUri) {
          urlFotoRemota = await subirFotoAlServidor(visita.fotoUri, token);
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
      }
      await marcarVisitaComoSincronizada(visita.id);
      sincronizadasAhora++;
    } catch {
      await marcarVisitaComoSincronizada(visita.id);
      sincronizadasAhora++;
    }
  }

  const actualizadas = await listarVisitasLocales();
  const pendientesRestantes = actualizadas.filter((v) => !v.sincronizada).length;

  return { sincronizadasAhora, pendientesRestantes };
}
