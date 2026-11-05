import { Categoria, Lugar, RespuestaExito } from "../tipos";
import { peticionApi } from "./api";

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

// 1 . Traer todas las categorias
export async function obtenerCategorias(): Promise<
  RespuestaExito<Categoria[]>
> {
  return peticionApi<Categoria[]>("/categorias");
}

// 2 . Traer listado de lugares (con filtros opcionales)
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

  return peticionApi<Lugar[]>(endpoint);
}

// 3 . Traer el detalle de un lugar por su id
export async function obtenerLugarPorId(
  id: string,
): Promise<RespuestaExito<Lugar>> {
  return peticionApi<Lugar>(`/lugares/${id}`);
}

// 4 . Traer un lugar escaneando el codigo QR del cartel
export async function obtenerLugarPorQr(
  codigo: string,
): Promise<RespuestaExito<Lugar>> {
  return peticionApi<Lugar>(`/lugares/qr/${encodeURIComponent(codigo)}`);
}
