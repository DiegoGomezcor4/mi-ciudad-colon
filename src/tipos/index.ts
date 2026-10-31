// tipos auxiliares y entidad lugar

export interface Coordenadas {
  latitud: number;
  longitud: number;
}

export interface Horario {
  dia: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = domingo, 1 = lunes, etc
  abre: string;
  cierra: string; // formato "HH:mm", ej "19:00"
}

export interface Audioguia {
  url: string;
  duracionSegundos: number;
  idioma: "es" | "en" | "pt";
}

export interface Lugar {
  id: string;
  nombre: string;
  categoriaId: string;
  descripcionCorta: string;
  descripcion: string;
  coordenadas: Coordenadas;
  direccion: string;
  imagenes: string[];
  horario: Horario[];
  telefono: string | null;
  sitioWeb: string | null;
  precioEntrada: number | null; //0 = gratis, null = no aplica
  audioguia: Audioguia | null;
  codigoQr: string | null;
  accesible: boolean;
  activo: boolean;
  actualizadoEn: string; // ISO 8601
}

// Entidades Categoria y Evento

export interface Categoria {
  id: string;
  nombre: string;
  icono: string; // nombre del icono de Ionicons
  color: string; // hexadecimal, ej "#8e5a4a"
  orden: number;
}

export type EstadoEvento =
  | "programado"
  | "suspendido "
  | "cancelado"
  | "finalizado";

export interface Evento {
  id: string;
  titulo: string;
  descripcion: string;
  lugarId: string | null;
  direccionLibre: string | null;
  coordenadas: Coordenadas | null; // solo si no hay lugarId
  inicio: string; // ISO 8601
  fin: string | null;
  imagenUrl: string | null;
  precio: number | null;
  estado: EstadoEvento;
}

// Entidades Usuario, Favorito y Visita

export interface Preferencias {
  categoriasFavoritas: string[];
  avisarProximidad: boolean;
  radioAvisoMetros: number; // 100, 250 o 500
  tema: "claro" | "oscuro" | "sistema";
}

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  avatarUrl: string | null;
  creadoEn: string; // ISO 8601
  preferencias: Preferencias;
}

export interface Favorito {
  id: string;
  usuarioId: string;
  lugarId: string;
  creadoEn: string; // ISO 8601
}

export type OrigenVisita = "qr" | "gps" | "manual";

export interface Visita {
  id: string;
  usuarioId: string;
  lugarId: string;
  fechaHora: string; // ISO 8601
  origen: OrigenVisita;
  fotoUri: string | null; // ruta local hasta que se sube
  nota: string | null;
  sincronizada: boolean;
}

// formato de respuesta de la aplica

export interface MetaPaginacion {
  total: number;
  pagina: number;
  porPagina: number;
}

export interface RespuestaExito<T> {
  datos: T;
  meta?: MetaPaginacion;
}

export interface ErrorApi {
  codigo: string;
  mensaje: string;
}

export interface RespuestaError {
  error: ErrorApi;
}
