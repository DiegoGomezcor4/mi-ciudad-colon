import { Platform } from "react-native";
import { Usuario } from "../tipos";

const CLAVE_TOKEN_SESION = "colon_token_sesion";
const CLAVE_USUARIO_SESION = "colon_usuario_sesion";
const CLAVE_DIRECTORIO_USUARIOS = "colon_directorio_usuarios";
let tokenEnMemoria: string | null = null;
let usuarioEnMemoria: Usuario | null = null;
const directorioUsuariosMemoria = new Map<string, Usuario>();

export async function guardarTokenSesion(token: string): Promise<void> {
  tokenEnMemoria = token;
  if (Platform.OS === "web") {
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require("expo-secure-store") as typeof import("expo-secure-store");
    await SecureStore.setItemAsync(CLAVE_TOKEN_SESION, token);
  } catch {}
}

export async function guardarUsuarioSesion(usuario: Usuario): Promise<void> {
  usuarioEnMemoria = usuario;
  const emailKey = usuario.email.trim().toLowerCase();
  directorioUsuariosMemoria.set(emailKey, usuario);
  if (Platform.OS === "web") {
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require("expo-secure-store") as typeof import("expo-secure-store");
    await SecureStore.setItemAsync(
      CLAVE_USUARIO_SESION,
      JSON.stringify(usuario),
    );
    const dirGuardado = await SecureStore.getItemAsync(
      CLAVE_DIRECTORIO_USUARIOS,
    );
    const mapa: Record<string, Usuario> = dirGuardado
      ? JSON.parse(dirGuardado)
      : {};
    mapa[emailKey] = usuario;
    await SecureStore.setItemAsync(
      CLAVE_DIRECTORIO_USUARIOS,
      JSON.stringify(mapa),
    );
  } catch {}
}

export async function obtenerUsuarioConocidoPorEmail(
  emailRaw: string,
): Promise<Usuario | null> {
  const emailKey = emailRaw.trim().toLowerCase();
  if (directorioUsuariosMemoria.has(emailKey)) {
    return directorioUsuariosMemoria.get(emailKey)!;
  }
  if (Platform.OS === "web") {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require("expo-secure-store") as typeof import("expo-secure-store");
    const dirGuardado = await SecureStore.getItemAsync(
      CLAVE_DIRECTORIO_USUARIOS,
    );
    if (dirGuardado) {
      const mapa = JSON.parse(dirGuardado) as Record<string, Usuario>;
      if (mapa[emailKey]) {
        directorioUsuariosMemoria.set(emailKey, mapa[emailKey]);
        return mapa[emailKey];
      }
    }
  } catch {}
  return null;
}

export async function obtenerUsuarioSesion(): Promise<Usuario | null> {
  if (Platform.OS === "web") {
    return usuarioEnMemoria;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require("expo-secure-store") as typeof import("expo-secure-store");
    const guardado = await SecureStore.getItemAsync(CLAVE_USUARIO_SESION);
    if (guardado) {
      const parsed = JSON.parse(guardado) as Usuario;
      usuarioEnMemoria = parsed;
      return parsed;
    }
    return usuarioEnMemoria;
  } catch {
    return usuarioEnMemoria;
  }
}

export function esTokenRemotoApi(token: string | null | undefined): token is string {
  return Boolean(
    token &&
      !token.startsWith("offline-sesion-") &&
      !token.startsWith("jwt-colon-"),
  );
}

export async function obtenerTokenSesion(): Promise<string | null> {
  if (Platform.OS === "web") {
    return tokenEnMemoria;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require("expo-secure-store") as typeof import("expo-secure-store");
    const guardado = await SecureStore.getItemAsync(CLAVE_TOKEN_SESION);
    return guardado ?? tokenEnMemoria;
  } catch {
    return tokenEnMemoria;
  }
}

export async function eliminarTokenSesion(): Promise<void> {
  tokenEnMemoria = null;
  usuarioEnMemoria = null;
  if (Platform.OS === "web") {
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require("expo-secure-store") as typeof import("expo-secure-store");
    await SecureStore.deleteItemAsync(CLAVE_TOKEN_SESION);
    await SecureStore.deleteItemAsync(CLAVE_USUARIO_SESION);
  } catch {}
}

export async function autenticarConBiometria(): Promise<boolean> {
  if (Platform.OS === "web") {
    return true;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const LocalAuthentication = require("expo-local-authentication") as typeof import("expo-local-authentication");
    const tieneHardware = await LocalAuthentication.hasHardwareAsync();
    const tieneBiometria = await LocalAuthentication.isEnrolledAsync();

    if (!tieneHardware || !tieneBiometria) {
      return true;
    }

    const resultado = await LocalAuthentication.authenticateAsync({
      promptMessage: "Ingresar a Mi Ciudad Colón",
      cancelLabel: "Usar contraseña",
      fallbackLabel: "Ingresar código",
    });

    return resultado.success;
  } catch {
    return true;
  }
}
