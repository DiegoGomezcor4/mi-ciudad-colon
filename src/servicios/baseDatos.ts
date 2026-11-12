import type * as SQLiteTypes from "expo-sqlite";
import { FAVORITOS_MOCK } from "../mocks/usuario";
import { VISITAS_MOCK } from "../mocks/visitas";
import { Favorito, Lugar, OrigenVisita, Visita } from "../tipos";

let dbPromesa: Promise<SQLiteTypes.SQLiteDatabase | null> | null = null;

// Respaldo en memoria en caso de que el motor nativo JSI de SQLite no esté disponible en el dispositivo
let lugaresMemoria: Lugar[] = [];
let visitasMemoria: Visita[] = [...VISITAS_MOCK];
let favoritosMemoria: Favorito[] = [...FAVORITOS_MOCK];

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
    `);

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

export async function listarVisitasLocales(): Promise<Visita[]> {
  try {
    const db = await obtenerBaseDatos();
    if (!db) return visitasMemoria;
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
    return visitasMemoria;
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

export async function listarFavoritosLocales(): Promise<Favorito[]> {
  try {
    const db = await obtenerBaseDatos();
    if (!db) return favoritosMemoria;
    return await db.getAllAsync<Favorito>(
      "SELECT * FROM favoritos_locales ORDER BY creadoEn DESC",
    );
  } catch {
    return favoritosMemoria;
  }
}

export async function esLugarFavoritoLocal(lugarId: string): Promise<boolean> {
  try {
    const db = await obtenerBaseDatos();
    if (!db) {
      return favoritosMemoria.some((f) => f.lugarId === lugarId);
    }
    const fila = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM favoritos_locales WHERE lugarId = ?",
      [lugarId],
    );
    return Boolean(fila);
  } catch {
    return favoritosMemoria.some((f) => f.lugarId === lugarId);
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
        "SELECT id FROM favoritos_locales WHERE lugarId = ?",
        [lugarId],
      );

      if (existente) {
        await db.runAsync("DELETE FROM favoritos_locales WHERE lugarId = ?", [
          lugarId,
        ]);
        favoritosMemoria = favoritosMemoria.filter(
          (f) => f.lugarId !== lugarId,
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

  const existeMem = favoritosMemoria.some((f) => f.lugarId === lugarId);
  if (existeMem) {
    favoritosMemoria = favoritosMemoria.filter((f) => f.lugarId !== lugarId);
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
