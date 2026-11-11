import { RespuestaError, RespuestaExito } from "../tipos";

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://192.168.2.102:3000";

const TIMEOUT_MS = 3500;

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
  } finally {
    clearTimeout(idTimeout);
  }
}
