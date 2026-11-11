import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const CLAVE_TOKEN_SESION = "colon_token_sesion";

export async function guardarTokenSesion(token: string): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }
  await SecureStore.setItemAsync(CLAVE_TOKEN_SESION, token);
}

export async function obtenerTokenSesion(): Promise<string | null> {
  if (Platform.OS === "web") {
    return null;
  }
  try {
    return await SecureStore.getItemAsync(CLAVE_TOKEN_SESION);
  } catch {
    return null;
  }
}

export async function eliminarTokenSesion(): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }
  try {
    await SecureStore.deleteItemAsync(CLAVE_TOKEN_SESION);
  } catch {}
}

export async function autenticarConBiometria(): Promise<boolean> {
  if (Platform.OS === "web") {
    return true;
  }
  try {
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
    return false;
  }
}
