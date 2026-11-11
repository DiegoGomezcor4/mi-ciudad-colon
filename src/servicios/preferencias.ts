import Storage from "expo-sqlite/kv-store";
import { Preferencias } from "../tipos";

const CLAVE_PREFERENCIAS = "colon_preferencias_usuario";
const CLAVE_EVENTOS_GUARDADOS = "colon_eventos_guardados";
const CLAVE_AVISOS_PROXIMIDAD = "colon_avisos_proximidad_diarios";

export const PREFERENCIAS_POR_DEFECTO: Preferencias = {
  categoriasFavoritas: ["cat-museos", "cat-playas"],
  avisarProximidad: true,
  radioAvisoMetros: 250,
  tema: "sistema",
};

export async function obtenerPreferenciasLocales(): Promise<Preferencias> {
  try {
    const guardado = await Storage.getItemAsync(CLAVE_PREFERENCIAS);
    if (!guardado) {
      return PREFERENCIAS_POR_DEFECTO;
    }
    return {
      ...PREFERENCIAS_POR_DEFECTO,
      ...(JSON.parse(guardado) as Partial<Preferencias>),
    };
  } catch {
    return PREFERENCIAS_POR_DEFECTO;
  }
}

export async function guardarPreferenciasLocales(
  preferencias: Preferencias,
): Promise<void> {
  try {
    await Storage.setItemAsync(
      CLAVE_PREFERENCIAS,
      JSON.stringify(preferencias),
    );
  } catch {}
}

export async function obtenerEventosGuardadosIds(): Promise<string[]> {
  try {
    const guardado = await Storage.getItemAsync(CLAVE_EVENTOS_GUARDADOS);
    return guardado ? (JSON.parse(guardado) as string[]) : [];
  } catch {
    return [];
  }
}

export async function alternarEventoGuardadoId(
  eventoId: string,
): Promise<boolean> {
  const actuales = await obtenerEventosGuardadosIds();
  const existe = actuales.includes(eventoId);
  const nuevos = existe
    ? actuales.filter((id) => id !== eventoId)
    : [...actuales, eventoId];
  try {
    await Storage.setItemAsync(CLAVE_EVENTOS_GUARDADOS, JSON.stringify(nuevos));
  } catch {}
  return !existe;
}

// Registra y verifica que solo se envíe como máximo 1 aviso por lugar y por día (PDF pág. 4)
export async function yaSeAvisoProximidadHoy(
  lugarId: string,
): Promise<boolean> {
  try {
    const hoy = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const guardado = await Storage.getItemAsync(CLAVE_AVISOS_PROXIMIDAD);
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
    const guardado = await Storage.getItemAsync(CLAVE_AVISOS_PROXIMIDAD);
    const mapa: Record<string, string> = guardado ? JSON.parse(guardado) : {};
    mapa[lugarId] = hoy;
    await Storage.setItemAsync(CLAVE_AVISOS_PROXIMIDAD, JSON.stringify(mapa));
  } catch {}
}
