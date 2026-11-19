import { Coordenadas, EstadoEvento, Preferencias } from "../tipos";

const CLAVE_PREFERENCIAS = "colon_preferencias_usuario";
const CLAVE_EVENTOS_GUARDADOS = "colon_eventos_guardados";
const CLAVE_ESTADOS_EVENTOS = "colon_estados_eventos_locales";
const CLAVE_AVISOS_PROXIMIDAD = "colon_avisos_proximidad_diarios";
const CLAVE_SIMULAR_GPS_COLON = "colon_simular_gps";

// Coordenada de demostración en Costanera de Colón para probar cercanía desde otra ciudad
export const UBICACION_DEMO_COLON: Coordenadas = {
  latitud: -32.2165,
  longitud: -58.1362,
};

let simularGpsEnColonActual = false;
const listenersGpsSimulado = new Set<(activo: boolean) => void>();

export function obtenerSimularGpsColonSincrono(): boolean {
  return simularGpsEnColonActual;
}

export async function cambiarSimularGpsColon(activo: boolean): Promise<void> {
  simularGpsEnColonActual = activo;
  listenersGpsSimulado.forEach((fn) => {
    try {
      fn(activo);
    } catch {}
  });
  await guardarItem(CLAVE_SIMULAR_GPS_COLON, activo ? "true" : "false");
}

export function suscribirSimularGpsColon(
  listener: (activo: boolean) => void,
): () => void {
  listenersGpsSimulado.add(listener);
  void leerItem(CLAVE_SIMULAR_GPS_COLON).then((val) => {
    if (val !== null) {
      const bool = val === "true";
      if (bool !== simularGpsEnColonActual) {
        simularGpsEnColonActual = bool;
        listener(bool);
      }
    }
  });
  return () => {
    listenersGpsSimulado.delete(listener);
  };
}

const memoriaRespaldo = new Map<string, string>();

export const PREFERENCIAS_POR_DEFECTO: Preferencias = {
  categoriasFavoritas: ["cat-museos", "cat-playas"],
  avisarProximidad: true,
  radioAvisoMetros: 250,
  tema: "sistema",
};

type ListenerPreferencias = (prefs: Preferencias) => void;
const listenersPreferencias = new Set<ListenerPreferencias>();
let cachePreferenciasActual: Preferencias = PREFERENCIAS_POR_DEFECTO;

export function obtenerPreferenciasSincronas(): Preferencias {
  return cachePreferenciasActual;
}

export function suscribirPreferencias(
  listener: ListenerPreferencias,
): () => void {
  listenersPreferencias.add(listener);
  return () => {
    listenersPreferencias.delete(listener);
  };
}

function notificarCambioPreferencias(prefs: Preferencias): void {
  cachePreferenciasActual = prefs;
  listenersPreferencias.forEach((fn) => {
    try {
      fn(prefs);
    } catch {}
  });
}

async function leerItem(clave: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const kv = require("expo-sqlite/kv-store");
    const Storage = kv.default || kv;
    const valor = await Storage.getItemAsync(clave);
    if (valor !== null && valor !== undefined) {
      memoriaRespaldo.set(clave, valor);
      return valor;
    }
  } catch {}
  return memoriaRespaldo.get(clave) ?? null;
}

async function guardarItem(clave: string, valor: string): Promise<void> {
  memoriaRespaldo.set(clave, valor);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const kv = require("expo-sqlite/kv-store");
    const Storage = kv.default || kv;
    await Storage.setItemAsync(clave, valor);
  } catch {}
}

export async function obtenerPreferenciasLocales(): Promise<Preferencias> {
  try {
    const guardado = await leerItem(CLAVE_PREFERENCIAS);
    if (!guardado) {
      return cachePreferenciasActual;
    }
    const combinadas: Preferencias = {
      ...PREFERENCIAS_POR_DEFECTO,
      ...(JSON.parse(guardado) as Partial<Preferencias>),
    };
    if (
      combinadas.tema !== cachePreferenciasActual.tema ||
      combinadas.radioAvisoMetros !==
        cachePreferenciasActual.radioAvisoMetros ||
      combinadas.avisarProximidad !== cachePreferenciasActual.avisarProximidad
    ) {
      notificarCambioPreferencias(combinadas);
    } else {
      cachePreferenciasActual = combinadas;
    }
    return combinadas;
  } catch {
    return cachePreferenciasActual;
  }
}

export async function guardarPreferenciasLocales(
  preferencias: Preferencias,
  usuarioId?: string,
): Promise<void> {
  notificarCambioPreferencias(preferencias);
  await guardarItem(CLAVE_PREFERENCIAS, JSON.stringify(preferencias));
  if (usuarioId) {
    await guardarItem(
      `${CLAVE_PREFERENCIAS}_${usuarioId}`,
      JSON.stringify(preferencias),
    );
  }
}

export async function obtenerPreferenciasDeUsuarioLocal(
  usuarioId: string,
): Promise<Preferencias | null> {
  try {
    const guardado = await leerItem(`${CLAVE_PREFERENCIAS}_${usuarioId}`);
    if (!guardado) return null;
    return {
      ...PREFERENCIAS_POR_DEFECTO,
      ...(JSON.parse(guardado) as Partial<Preferencias>),
    };
  } catch {
    return null;
  }
}

export async function marcarPreferenciasPendientesSync(
  usuarioId: string,
  pendiente: boolean,
): Promise<void> {
  await guardarItem(
    `${CLAVE_PREFERENCIAS}_sync_${usuarioId}`,
    pendiente ? "true" : "false",
  );
}

export async function tienePreferenciasPendientesSync(
  usuarioId: string,
): Promise<boolean> {
  const val = await leerItem(`${CLAVE_PREFERENCIAS}_sync_${usuarioId}`);
  return val === "true";
}

export async function obtenerEventosGuardadosIds(
  usuarioId?: string,
): Promise<string[]> {
  if (!usuarioId) {
    return [];
  }
  try {
    const clave = `${CLAVE_EVENTOS_GUARDADOS}_${usuarioId}`;
    const guardado = await leerItem(clave);
    return guardado ? (JSON.parse(guardado) as string[]) : [];
  } catch {
    return [];
  }
}

export async function guardarEventosGuardadosIds(
  ids: string[],
  usuarioId?: string,
): Promise<void> {
  if (!usuarioId) return;
  const clave = `${CLAVE_EVENTOS_GUARDADOS}_${usuarioId}`;
  await guardarItem(clave, JSON.stringify(ids));
}

export async function alternarEventoGuardadoId(
  eventoId: string,
  usuarioId?: string,
): Promise<boolean> {
  if (!usuarioId) return false;
  const actuales = await obtenerEventosGuardadosIds(usuarioId);
  const existe = actuales.includes(eventoId);
  const nuevos = existe
    ? actuales.filter((id) => id !== eventoId)
    : [...actuales, eventoId];
  await guardarEventosGuardadosIds(nuevos, usuarioId);
  return !existe;
}

// Registra y verifica que solo se envíe como máximo 1 aviso por lugar y por día (PDF pág. 4)
export async function yaSeAvisoProximidadHoy(
  lugarId: string,
): Promise<boolean> {
  try {
    const hoy = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const guardado = await leerItem(CLAVE_AVISOS_PROXIMIDAD);
    const mapa: Record<string, string> = guardado ? JSON.parse(guardado) : {};
    return mapa[lugarId] === hoy;
  } catch {
    return false;
  }
}

export async function registrarAvisoProximidadHoy(
  lugarId: string,
): Promise<void> {
  try {
    const hoy = new Date().toISOString().slice(0, 10);
    const guardado = await leerItem(CLAVE_AVISOS_PROXIMIDAD);
    const mapa: Record<string, string> = guardado ? JSON.parse(guardado) : {};
    mapa[lugarId] = hoy;
    await guardarItem(CLAVE_AVISOS_PROXIMIDAD, JSON.stringify(mapa));
  } catch {}
}

export async function obtenerEstadosEventosLocales(): Promise<
  Record<string, EstadoEvento>
> {
  try {
    const guardado = await leerItem(CLAVE_ESTADOS_EVENTOS);
    return guardado ? (JSON.parse(guardado) as Record<string, EstadoEvento>) : {};
  } catch {
    return {};
  }
}

export async function guardarEstadoEventoLocal(
  eventoId: string,
  estado: EstadoEvento,
): Promise<void> {
  try {
    const mapa = await obtenerEstadosEventosLocales();
    mapa[eventoId] = estado;
    await guardarItem(CLAVE_ESTADOS_EVENTOS, JSON.stringify(mapa));
  } catch {}
}
