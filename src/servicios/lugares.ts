import { CATEGORIAS_MOCK } from "../mocks/categorias";
import { LUGARES_MOCK } from "../mocks/lugares";
import { Categoria, Coordenadas, Lugar, RespuestaExito } from "../tipos";
import { peticionApi } from "./api";
import { guardarLugaresEnCache, obtenerLugaresDeCache } from "./baseDatos";

export interface FiltrosLugares {
  pagina?: number;
  porPagina?: number;
  categoriaId?: string;
  q?: string;
  latitud?: number;
  longitud?: number;
  radioMetros?: number;
  orden?: "nombre" | "distancia";
  accesible?: boolean;
  actualizadoDesde?: string;
}

// Calcula la distancia en metros entre dos coordenadas usando la fórmula de Haversine
export function calcularDistanciaMetros(
  origen: Coordenadas,
  destino: Coordenadas,
): number {
  const R = 6371000;
  const dLat = ((destino.latitud - origen.latitud) * Math.PI) / 180;
  const dLon = ((destino.longitud - origen.longitud) * Math.PI) / 180;
  const lat1 = (origen.latitud * Math.PI) / 180;
  const lat2 = (destino.latitud * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calcula el rumbo (bearing de 0 a 360 grados respecto al Norte) desde el usuario hacia el lugar
export function calcularRumboGrados(
  origen: Coordenadas,
  destino: Coordenadas,
): number {
  const lat1 = (origen.latitud * Math.PI) / 180;
  const lat2 = (destino.latitud * Math.PI) / 180;
  const dLon = ((destino.longitud - origen.longitud) * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

export function formatearDistancia(metros: number): string {
  if (metros < 1000) {
    return `${Math.round(metros)} m`;
  }
  return `${(metros / 1000).toFixed(1).replace(".", ",")} km`;
}

// 1. Traer todas las categorias
export async function obtenerCategorias(): Promise<
  RespuestaExito<Categoria[]>
> {
  try {
    return await peticionApi<Categoria[]>("/categorias");
  } catch {
    return {
      datos: CATEGORIAS_MOCK,
      meta: {
        total: CATEGORIAS_MOCK.length,
        pagina: 1,
        porPagina: CATEGORIAS_MOCK.length,
      },
    };
  }
}

// 2. Traer listado de lugares (con filtros opcionales y caché local en SQLite para uso sin señal)
export async function obtenerLugares(
  filtros: FiltrosLugares = {},
): Promise<RespuestaExito<Lugar[]>> {
  const params = new URLSearchParams();

  if (filtros.pagina) params.append("pagina", String(filtros.pagina));
  if (filtros.porPagina) params.append("porPagina", String(filtros.porPagina));
  if (filtros.categoriaId) params.append("categoriaId", filtros.categoriaId);
  if (filtros.q) params.append("q", filtros.q);
  if (filtros.latitud !== undefined)
    params.append("latitud", String(filtros.latitud));
  if (filtros.longitud !== undefined)
    params.append("longitud", String(filtros.longitud));
  if (filtros.radioMetros)
    params.append("radioMetros", String(filtros.radioMetros));
  if (filtros.orden) params.append("orden", filtros.orden);
  if (filtros.accesible) params.append("accesible", "true");
  if (filtros.actualizadoDesde)
    params.append("actualizadoDesde", filtros.actualizadoDesde);

  const queryString = params.toString();
  const endpoint = queryString ? `/lugares?${queryString}` : "/lugares";

  try {
    const respuesta = await peticionApi<Lugar[]>(endpoint);
    if (respuesta.datos.length > 0) {
      await guardarLugaresEnCache(respuesta.datos);
    }
    return respuesta;
  } catch {
    const cacheados = await obtenerLugaresDeCache();
    const base = cacheados.length > 0 ? cacheados : LUGARES_MOCK;
    if (cacheados.length === 0) {
      await guardarLugaresEnCache(LUGARES_MOCK);
    }

    let resultado = base.filter((l) => l.activo);
    if (filtros.categoriaId) {
      resultado = resultado.filter(
        (l) => l.categoriaId === filtros.categoriaId,
      );
    }
    if (filtros.q) {
      const qLower = filtros.q.toLowerCase();
      resultado = resultado.filter(
        (l) =>
          l.nombre.toLowerCase().includes(qLower) ||
          l.descripcionCorta.toLowerCase().includes(qLower),
      );
    }
    if (filtros.accesible) {
      resultado = resultado.filter((l) => l.accesible);
    }
    if (
      filtros.orden === "distancia" &&
      filtros.latitud !== undefined &&
      filtros.longitud !== undefined
    ) {
      const origen = { latitud: filtros.latitud, longitud: filtros.longitud };
      resultado = [...resultado].sort(
        (a, b) =>
          calcularDistanciaMetros(origen, a.coordenadas) -
          calcularDistanciaMetros(origen, b.coordenadas),
      );
    }
    return {
      datos: resultado,
      meta: { total: resultado.length, pagina: 1, porPagina: 20 },
    };
  }
}

// 3. Traer el detalle de un lugar por su id
export async function obtenerLugarPorId(
  id: string,
): Promise<RespuestaExito<Lugar>> {
  try {
    return await peticionApi<Lugar>(`/lugares/${id}`);
  } catch {
    const cacheados = await obtenerLugaresDeCache();
    const base = cacheados.length > 0 ? cacheados : LUGARES_MOCK;
    const lugar = base.find((l) => l.id === id);
    if (!lugar) {
      throw new Error("No existe ese lugar.");
    }
    return { datos: lugar, meta: null };
  }
}

// 4. Traer un lugar escaneando el codigo QR del cartel
export async function obtenerLugarPorQr(
  codigo: string,
): Promise<RespuestaExito<Lugar>> {
  try {
    return await peticionApi<Lugar>(`/lugares/qr/${encodeURIComponent(codigo)}`);
  } catch {
    const cacheados = await obtenerLugaresDeCache();
    const base = cacheados.length > 0 ? cacheados : LUGARES_MOCK;
    const codigoLimpio = codigo.trim();
    const lugar = base.find(
      (l) => l.codigoQr === codigoLimpio || `COLON:${l.id}` === codigoLimpio,
    );
    if (!lugar) {
      throw new Error("El código QR escaneado no pertenece a Mi Ciudad Colón.");
    }
    return { datos: lugar, meta: null };
  }
}
