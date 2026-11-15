import { AppState } from "react-native";
import { RespuestaError, RespuestaExito } from "../tipos";

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.8:3000";

const TIMEOUT_MS = 3500;
const TIMEOUT_SALUD_MS = 2000;
const INTERVALO_MONITOREO_MS = 4000;

type ListenerEstadoApi = (conectado: boolean) => void;

let ultimoEstadoConectado: boolean | null = null;
const listeners = new Set<ListenerEstadoApi>();

function emitirEstadoApi(conectado: boolean): void {
  const cambio = ultimoEstadoConectado !== conectado;
  ultimoEstadoConectado = conectado;
  if (cambio) {
    listeners.forEach((fn) => {
      try {
        fn(conectado);
      } catch {}
    });
  }
}

export function obtenerUltimoEstadoApi(): boolean | null {
  return ultimoEstadoConectado;
}

// Verifica activamente el endpoint liviano GET /salud de la API
export async function verificarSaludApi(): Promise<boolean> {
  const controlador = new AbortController();
  const idTimeout = setTimeout(() => controlador.abort(), TIMEOUT_SALUD_MS);

  try {
    const respuesta = await fetch(`${API_URL}/salud`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controlador.signal,
    });
    const ok = respuesta.ok;
    emitirEstadoApi(ok);
    return ok;
  } catch {
    emitirEstadoApi(false);
    return false;
  } finally {
    clearTimeout(idTimeout);
  }
}

// Suscribe un componente en tiempo real al momento exacto de conexión y desconexión de la API
export function monitorearConexionApi(
  alCambiar: (conectado: boolean) => void,
): () => void {
  listeners.add(alCambiar);
  if (ultimoEstadoConectado !== null) {
    alCambiar(ultimoEstadoConectado);
  }

  // Verificación inmediata al suscribirse
  void verificarSaludApi();

  // Sondeo periódico liviano cada 4 segundos para detectar conexión/desconexión al instante
  const intervalo = setInterval(() => {
    if (AppState.currentState === "active") {
      void verificarSaludApi();
    }
  }, INTERVALO_MONITOREO_MS);

  // Detectar cuando la app vuelve a primer plano
  const subAppState = AppState.addEventListener("change", (estado) => {
    if (estado === "active") {
      void verificarSaludApi();
    }
  });

  // Detectar cambios instantáneos de Wi-Fi / datos móviles mediante expo-network
  let subRed: { remove?: () => void } | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Network = require("expo-network") as typeof import("expo-network");
    if (typeof Network.addNetworkStateListener === "function") {
      subRed = Network.addNetworkStateListener((estadoRed) => {
        if (estadoRed.isConnected === false) {
          emitirEstadoApi(false);
        } else {
          void verificarSaludApi();
        }
      });
    }
  } catch {}

  return () => {
    listeners.delete(alCambiar);
    clearInterval(intervalo);
    subAppState.remove();
    subRed?.remove?.();
  };
}

export async function peticionApi<T>(
  endpoint: string,
  opciones: RequestInit = {},
  token?: string | null,
): Promise<RespuestaExito<T>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opciones.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const controlador = new AbortController();
  const idTimeout = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  try {
    const respuesta = await fetch(`${API_URL}${endpoint}`, {
      ...opciones,
      headers,
      signal: controlador.signal,
    });

    // El servidor respondió: la conexión con la API está activa
    emitirEstadoApi(true);

    if (respuesta.status === 204) {
      return { datos: undefined as T, meta: null };
    }

    const json = await respuesta.json();

    if (!respuesta.ok) {
      const errorApi = (json as RespuestaError).error;
      throw new Error(
        errorApi?.mensaje || "Error al conectar con el servidor.",
      );
    }

    return json as RespuestaExito<T>;
  } catch (err) {
    // Si falló la red o hubo timeout, marcamos desconexión inmediata
    if (
      err instanceof TypeError ||
      (err instanceof Error && err.name === "AbortError")
    ) {
      emitirEstadoApi(false);
    }
    throw err;
  } finally {
    clearTimeout(idTimeout);
  }
}
