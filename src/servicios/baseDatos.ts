import * as SQLite from "expo-sqlite";
import { FAVORITOS_MOCK } from "../mocks/usuario";
import { VISITAS_MOCK } from "../mocks/visitas";
import { Favorito, Lugar, OrigenVisita, Visita } from "../tipos";

let dbPromesa: Promise<SQLite.SQLiteDatabase> | null = null;

export async function obtenerBaseDatos(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromesa) {
    dbPromesa = inicializarBaseDatos();
  }
  return dbPromesa;
}

async function inicializarBaseDatos(): Promise<SQLite.SQLiteDatabase> {
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
  `);

  // Sembrar visitas y favoritos iniciales de demostración si la tabla está vacía
  const totalVisitas = await db.getFirstAsync<{ total: number }>(
    "SELECT COUNT(*) as total FROM visitas_locales",
  );
  if (!totalVisitas || totalVisitas.total === 0) {
    for (const v of VISITAS_MOCK) {
      await db.runAsync(
        `INSERT OR IGNORE INTO visitas_locales (id, usuarioId, lugarId, fechaHora, origen, fotoUri, nota, sincronizada)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          v.id,
          v.usuarioId,
          v.lugarId,
          v.fechaHora,
          v.origen,
          v.fotoUri,
          v.nota,
          v.sincronizada ? 1 : 0,
        ],
      );
    }
  }

  const totalFavoritos = await db.getFirstAsync<{ total: number }>(
    "SELECT COUNT(*) as total FROM favoritos_locales",
  );
  if (!totalFavoritos || totalFavoritos.total === 0) {
    for (const f of FAVORITOS_MOCK) {
      await db.runAsync(
        `INSERT OR IGNORE INTO favoritos_locales (id, usuarioId, lugarId, creadoEn)
         VALUES (?, ?, ?, ?)`,
        [f.id, f.usuarioId, f.lugarId, f.creadoEn],
      );
    }
  }

  return db;
}

export async function guardarLugaresEnCache(lugares: Lugar[]): Promise<void> {
  try {
    const db = await obtenerBaseDatos();
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
    const filas = await db.getAllAsync<{ json: string }>(
      "SELECT json FROM lugares_cache",
    );
    return filas.map((f) => JSON.parse(f.json) as Lugar);
  } catch {
    return [];
  }
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

export async function listarVisitasLocales(): Promise<Visita[]> {
  try {
    const db = await obtenerBaseDatos();
    const filas = await db.getAllAsync<FilaVisita>(
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
    return VISITAS_MOCK;
  }
}

export async function insertarVisitaLocal(visita: Visita): Promise<void> {
  const db = await obtenerBaseDatos();
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
}

export async function marcarVisitaComoSincronizada(id: string): Promise<void> {
  const db = await obtenerBaseDatos();
  await db.runAsync(
    "UPDATE visitas_locales SET sincronizada = 1 WHERE id = ?",
    [id],
  );
}

export async function listarFavoritosLocales(): Promise<Favorito[]> {
  try {
    const db = await obtenerBaseDatos();
    return await db.getAllAsync<Favorito>(
      "SELECT * FROM favoritos_locales ORDER BY creadoEn DESC",
    );
  } catch {
    return FAVORITOS_MOCK;
  }
}

export async function esLugarFavoritoLocal(lugarId: string): Promise<boolean> {
  try {
    const db = await obtenerBaseDatos();
    const fila = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM favoritos_locales WHERE lugarId = ?",
      [lugarId],
    );
    return Boolean(fila);
  } catch {
    return false;
  }
}

export async function alternarFavoritoLocal(
  lugarId: string,
  usuarioId = "usr-201",
): Promise<boolean> {
  const db = await obtenerBaseDatos();
  const existente = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM favoritos_locales WHERE lugarId = ?",
    [lugarId],
  );

  if (existente) {
    await db.runAsync("DELETE FROM favoritos_locales WHERE lugarId = ?", [
      lugarId,
    ]);
    return false;
  }

  const nuevoId = `fav-${Date.now()}`;
  const ahoraIso = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO favoritos_locales (id, usuarioId, lugarId, creadoEn) VALUES (?, ?, ?, ?)`,
    [nuevoId, usuarioId, lugarId, ahoraIso],
  );
  return true;
}
