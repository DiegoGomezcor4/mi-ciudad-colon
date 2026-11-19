import type * as SQLiteTypes from "expo-sqlite";
import { Favorito, Lugar, OrigenVisita, Visita } from "../tipos";

let dbPromesa: Promise<SQLiteTypes.SQLiteDatabase | null> | null = null;

// Respaldo en memoria vacío (sin datos de mockup)
let lugaresMemoria: Lugar[] = [];
let visitasMemoria: Visita[] = [];
let favoritosMemoria: Favorito[] = [];

export async function obtenerBaseDatos(): Promise<SQLiteTypes.SQLiteDatabase | null> {
  if (!dbPromesa) {
    dbPromesa = inicializarBaseDatos().catch(() => null);
  }
  return dbPromesa;
}

async function inicializarBaseDatos(): Promise<SQLiteTypes.SQLiteDatabase | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SQLite = require("expo-sqlite") as typeof SQLiteTypes;
    const db = await SQLite.openDatabaseAsync("mi_ciudad_colon.db");

    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS lugares_cache (
        id TEXT PRIMARY KEY NOT NULL,
        json TEXT NOT NULL,
        actualizadoEn TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS visitas_locales (
        id TEXT PRIMARY KEY NOT NULL,
        usuarioId TEXT NOT NULL,
        lugarId TEXT NOT NULL,
        fechaHora TEXT NOT NULL,
        origen TEXT NOT NULL,
        fotoUri TEXT,
        nota TEXT,
        sincronizada INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS favoritos_locales (
        id TEXT PRIMARY KEY NOT NULL,
        usuarioId TEXT NOT NULL,
        lugarId TEXT NOT NULL,
        creadoEn TEXT NOT NULL
      );
      DELETE FROM visitas_locales WHERE id IN ('vis-311', 'vis-312');
      DELETE FROM favoritos_locales WHERE id IN ('fav-088', 'fav-089');
    `);

    return db;
  } catch {
    return null;
  }
}

export async function guardarLugaresEnCache(lugares: Lugar[]): Promise<void> {
  lugaresMemoria = [...lugares];
  try {
    const db = await obtenerBaseDatos();
    if (!db) return;
    for (const lugar of lugares) {
      await db.runAsync(
        `INSERT OR REPLACE INTO lugares_cache (id, json, actualizadoEn) VALUES (?, ?, ?)`,
        [lugar.id, JSON.stringify(lugar), lugar.actualizadoEn],
      );
    }
  } catch {}
}

export async function obtenerLugaresDeCache(): Promise<Lugar[]> {
  try {
    const db = await obtenerBaseDatos();
    if (!db) return lugaresMemoria;
    const filas = await db.getAllAsync<{ json: string }>(
      "SELECT json FROM lugares_cache",
    );
    if (filas.length > 0) {
      return filas.map((f) => JSON.parse(f.json) as Lugar);
    }
  } catch {}
  return lugaresMemoria;
}

interface FilaVisita {
  id: string;
  usuarioId: string;
  lugarId: string;
  fechaHora: string;
  origen: OrigenVisita;
  fotoUri: string | null;
  nota: string | null;
  sincronizada: number;
}

export async function listarVisitasLocales(
  usuarioId?: string,
): Promise<Visita[]> {
  try {
    const db = await obtenerBaseDatos();
    if (!db) {
      return usuarioId
        ? visitasMemoria.filter((v) => v.usuarioId === usuarioId)
        : visitasMemoria;
    }
    const filas = usuarioId
      ? await db.getAllAsync<FilaVisita>(
          "SELECT * FROM visitas_locales WHERE usuarioId = ? ORDER BY fechaHora DESC",
          [usuarioId],
        )
      : await db.getAllAsync<FilaVisita>(
          "SELECT * FROM visitas_locales ORDER BY fechaHora DESC",
        );
    return filas.map((f) => ({
      id: f.id,
      usuarioId: f.usuarioId,
      lugarId: f.lugarId,
      fechaHora: f.fechaHora,
      origen: f.origen,
      fotoUri: f.fotoUri,
      nota: f.nota,
      sincronizada: Boolean(f.sincronizada),
    }));
  } catch {
    return usuarioId
      ? visitasMemoria.filter((v) => v.usuarioId === usuarioId)
      : visitasMemoria;
  }
}

export async function insertarVisitaLocal(visita: Visita): Promise<void> {
  visitasMemoria = [
    visita,
    ...visitasMemoria.filter((v) => v.id !== visita.id),
  ];
  try {
    const db = await obtenerBaseDatos();
    if (!db) return;
    await db.runAsync(
      `INSERT OR REPLACE INTO visitas_locales (id, usuarioId, lugarId, fechaHora, origen, fotoUri, nota, sincronizada)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        visita.id,
        visita.usuarioId,
        visita.lugarId,
        visita.fechaHora,
        visita.origen,
        visita.fotoUri,
        visita.nota,
        visita.sincronizada ? 1 : 0,
      ],
    );
  } catch {}
}

export async function marcarVisitaComoSincronizada(id: string): Promise<void> {
  visitasMemoria = visitasMemoria.map((v) =>
    v.id === id ? { ...v, sincronizada: true } : v,
  );
  try {
    const db = await obtenerBaseDatos();
    if (!db) return;
    await db.runAsync(
      "UPDATE visitas_locales SET sincronizada = 1 WHERE id = ?",
      [id],
    );
  } catch {}
}

export async function actualizarVisitaLocal(
  id: string,
  cambios: { fotoUri?: string | null; nota?: string | null },
): Promise<void> {
  visitasMemoria = visitasMemoria.map((v) =>
    v.id === id
      ? {
          ...v,
          fotoUri: cambios.fotoUri !== undefined ? cambios.fotoUri : v.fotoUri,
          nota: cambios.nota !== undefined ? cambios.nota : v.nota,
        }
      : v,
  );
  try {
    const db = await obtenerBaseDatos();
    if (!db) return;
    const actual = await db.getFirstAsync<FilaVisita>(
      "SELECT * FROM visitas_locales WHERE id = ?",
      [id],
    );
    if (actual) {
      const nuevaFoto =
        cambios.fotoUri !== undefined ? cambios.fotoUri : actual.fotoUri;
      const nuevaNota = cambios.nota !== undefined ? cambios.nota : actual.nota;
      await db.runAsync(
        "UPDATE visitas_locales SET fotoUri = ?, nota = ? WHERE id = ?",
        [nuevaFoto, nuevaNota, id],
      );
    }
  } catch {}
}

export async function listarFavoritosLocales(
  usuarioId?: string,
): Promise<Favorito[]> {
  try {
    const db = await obtenerBaseDatos();
    if (!db) {
      return usuarioId
        ? favoritosMemoria.filter((f) => f.usuarioId === usuarioId)
        : favoritosMemoria;
    }
    if (usuarioId) {
      return await db.getAllAsync<Favorito>(
        "SELECT * FROM favoritos_locales WHERE usuarioId = ? ORDER BY creadoEn DESC",
        [usuarioId],
      );
    }
    return await db.getAllAsync<Favorito>(
      "SELECT * FROM favoritos_locales ORDER BY creadoEn DESC",
    );
  } catch {
    return usuarioId
      ? favoritosMemoria.filter((f) => f.usuarioId === usuarioId)
      : favoritosMemoria;
  }
}

// Actualiza la tabla SQLite local para que coincida exactamente con los favoritos del usuario en la API
export async function sincronizarEspejoFavoritosLocal(
  favoritosRemotos: Favorito[],
  usuarioId?: string,
): Promise<void> {
  const uid = usuarioId || favoritosRemotos[0]?.usuarioId;
  if (uid) {
    favoritosMemoria = [
      ...favoritosMemoria.filter((f) => f.usuarioId !== uid),
      ...favoritosRemotos,
    ];
  } else {
    favoritosMemoria = [...favoritosRemotos];
  }
  try {
    const db = await obtenerBaseDatos();
    if (!db) return;
    if (uid) {
      await db.runAsync("DELETE FROM favoritos_locales WHERE usuarioId = ?", [
        uid,
      ]);
    } else {
      await db.runAsync("DELETE FROM favoritos_locales");
    }
    for (const f of favoritosRemotos) {
      await db.runAsync(
        `INSERT OR REPLACE INTO favoritos_locales (id, usuarioId, lugarId, creadoEn) VALUES (?, ?, ?, ?)`,
        [f.id, f.usuarioId, f.lugarId, f.creadoEn],
      );
    }
  } catch {}
}

// Actualiza la tabla SQLite local con las visitas del servidor (conservando las pendientes offline y las fotos locales)
export async function sincronizarEspejoVisitasLocal(
  visitasRemotas: Visita[],
  usuarioId?: string,
): Promise<void> {
  try {
    const uid = usuarioId || visitasRemotas[0]?.usuarioId;
    const actuales = await listarVisitasLocales(uid);
    const mapaFotosLocales = new Map<string, string>();
    for (const v of actuales) {
      if (v.fotoUri) {
        mapaFotosLocales.set(v.id, v.fotoUri);
      }
    }

    const pendientes = actuales.filter((v) => !v.sincronizada);
    const idsRemotos = new Set(visitasRemotas.map((v) => v.id));
    const pendientesNoSubidas = pendientes.filter(
      (v) => !idsRemotos.has(v.id),
    );

    const remotasConFoto = visitasRemotas.map((remota) => ({
      ...remota,
      fotoUri: remota.fotoUri || mapaFotosLocales.get(remota.id) || null,
      sincronizada: true,
    }));

    const nuevoEspejo = [...pendientesNoSubidas, ...remotasConFoto].sort(
      (a, b) =>
        new Date(b.fechaHora).getTime() - new Date(a.fechaHora).getTime(),
    );

    if (uid) {
      visitasMemoria = [
        ...visitasMemoria.filter((v) => v.usuarioId !== uid),
        ...nuevoEspejo,
      ];
    } else {
      visitasMemoria = nuevoEspejo;
    }

    const db = await obtenerBaseDatos();
    if (!db) return;
    if (uid) {
      await db.runAsync(
        "DELETE FROM visitas_locales WHERE sincronizada = 1 AND usuarioId = ?",
        [uid],
      );
    } else {
      await db.runAsync("DELETE FROM visitas_locales WHERE sincronizada = 1");
    }
    for (const v of remotasConFoto) {
      await db.runAsync(
        `INSERT OR REPLACE INTO visitas_locales (id, usuarioId, lugarId, fechaHora, origen, fotoUri, nota, sincronizada)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          v.id,
          v.usuarioId,
          v.lugarId,
          v.fechaHora,
          v.origen,
          v.fotoUri,
          v.nota,
        ],
      );
    }
  } catch {}
}

export async function limpiarEspejoUsuarioLocal(): Promise<void> {
  // No borramos las filas particionadas por usuarioId en SQLite para que cada usuario conserve su caché cuando vuelva a entrar sin conexión
}

export async function esLugarFavoritoLocal(
  lugarId: string,
  usuarioId?: string,
): Promise<boolean> {
  try {
    const db = await obtenerBaseDatos();
    if (!db) {
      return favoritosMemoria.some(
        (f) => f.lugarId === lugarId && (!usuarioId || f.usuarioId === usuarioId),
      );
    }
    const fila = usuarioId
      ? await db.getFirstAsync<{ id: string }>(
          "SELECT id FROM favoritos_locales WHERE lugarId = ? AND usuarioId = ?",
          [lugarId, usuarioId],
        )
      : await db.getFirstAsync<{ id: string }>(
          "SELECT id FROM favoritos_locales WHERE lugarId = ?",
          [lugarId],
        );
    return Boolean(fila);
  } catch {
    return favoritosMemoria.some(
      (f) => f.lugarId === lugarId && (!usuarioId || f.usuarioId === usuarioId),
    );
  }
}

export async function alternarFavoritoLocal(
  lugarId: string,
  usuarioId = "usr-201",
): Promise<boolean> {
  try {
    const db = await obtenerBaseDatos();
    if (db) {
      const existente = await db.getFirstAsync<{ id: string }>(
        "SELECT id FROM favoritos_locales WHERE lugarId = ? AND usuarioId = ?",
        [lugarId, usuarioId],
      );

      if (existente) {
        await db.runAsync(
          "DELETE FROM favoritos_locales WHERE lugarId = ? AND usuarioId = ?",
          [lugarId, usuarioId],
        );
        favoritosMemoria = favoritosMemoria.filter(
          (f) => !(f.lugarId === lugarId && f.usuarioId === usuarioId),
        );
        return false;
      }

      const nuevoId = `fav-${Date.now()}`;
      const ahoraIso = new Date().toISOString();
      await db.runAsync(
        `INSERT INTO favoritos_locales (id, usuarioId, lugarId, creadoEn) VALUES (?, ?, ?, ?)`,
        [nuevoId, usuarioId, lugarId, ahoraIso],
      );
      favoritosMemoria = [
        { id: nuevoId, usuarioId, lugarId, creadoEn: ahoraIso },
        ...favoritosMemoria,
      ];
      return true;
    }
  } catch {}

  const existeMem = favoritosMemoria.some(
    (f) => f.lugarId === lugarId && f.usuarioId === usuarioId,
  );
  if (existeMem) {
    favoritosMemoria = favoritosMemoria.filter(
      (f) => !(f.lugarId === lugarId && f.usuarioId === usuarioId),
    );
    return false;
  }
  const nuevoFav: Favorito = {
    id: `fav-${Date.now()}`,
    usuarioId,
    lugarId,
    creadoEn: new Date().toISOString(),
  };
  favoritosMemoria = [nuevoFav, ...favoritosMemoria];
  return true;
}
