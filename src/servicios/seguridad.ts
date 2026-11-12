import { Platform } from "react-native";

const CLAVE_TOKEN_SESION = "colon_token_sesion";
let tokenEnMemoria: string | null = null;

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
  if (Platform.OS === "web") {
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require("expo-secure-store") as typeof import("expo-secure-store");
    await SecureStore.deleteItemAsync(CLAVE_TOKEN_SESION);
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
