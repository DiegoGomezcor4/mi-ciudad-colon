import { Platform } from "react-native";
import { Evento, Lugar } from "../tipos";
import {
  obtenerPreferenciasLocales,
  registrarAvisoProximidadHoy,
  yaSeAvisoProximidadHoy,
} from "./preferencias";

let manejadorConfigurado = false;

function obtenerModuloNotificaciones(): typeof import("expo-notifications") | null {
  if (Platform.OS === "web") {
    return null;
  }
  try {
    // Carga diferida para evitar que DevicePushTokenAutoRegistration o ExpoApplication fallen al iniciar el APK sin Firebase
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require("expo-notifications") as typeof import("expo-notifications");
    if (!manejadorConfigurado) {
      manejadorConfigurado = true;
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    }
    return Notifications;
  } catch {
    return null;
  }
}

export async function solicitarPermisoNotificaciones(): Promise<boolean> {
  const Notifications = obtenerModuloNotificaciones();
  if (!Notifications) {
    return false;
  }
  try {
    const actual = await Notifications.getPermissionsAsync();
    if (actual.granted) {
      return true;
    }
    const pedido = await Notifications.requestPermissionsAsync();
    return pedido.granted;
  } catch {
    return false;
  }
}

// Programa un recordatorio para un evento de la agenda (y avisa si fue suspendido o cancelado)
export async function programarRecordatorioEvento(
  evento: Evento,
): Promise<boolean> {
  const Notifications = obtenerModuloNotificaciones();
  if (!Notifications) {
    return false;
  }
  try {
    const tienePermiso = await solicitarPermisoNotificaciones();
    if (!tienePermiso) {
      return false;
    }

    if (evento.estado === "cancelado" || evento.estado === "suspendido") {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Evento ${evento.estado}: ${evento.titulo}`,
          body: `Te avisamos que "${evento.titulo}" se encuentra ${evento.estado}.`,
          data: { eventoId: evento.id },
        },
        trigger: null,
      });
      return true;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Recordatorio: ${evento.titulo}`,
        body: `Guardaste este evento en tu agenda de Colón. ¡No te lo pierdas!`,
        data: { eventoId: evento.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 5,
        repeats: false,
      },
    });

    return true;
  } catch {
    return false;
  }
}

// Envía como máximo 1 aviso por lugar y por día cuando el turista está dentro del radio configurado (PDF pág. 4)
export async function verificarYNotificarProximidad(
  lugar: Lugar,
  distanciaMetros: number,
): Promise<void> {
  try {
    const prefs = await obtenerPreferenciasLocales();
    if (!prefs.avisarProximidad) {
      return;
    }
    if (distanciaMetros > prefs.radioAvisoMetros) {
      return;
    }

    const yaAvisado = await yaSeAvisoProximidadHoy(lugar.id);
    if (yaAvisado) {
      return;
    }

    const Notifications = obtenerModuloNotificaciones();
    if (!Notifications) {
      return;
    }

    const tienePermiso = await solicitarPermisoNotificaciones();
    if (!tienePermiso) {
      return;
    }

    await registrarAvisoProximidadHoy(lugar.id);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Estás cerca de ${lugar.nombre}`,
        body: `A ${Math.round(distanciaMetros)} m: ${lugar.descripcionCorta}`,
        data: { lugarId: lugar.id },
      },
      trigger: null,
    });
  } catch {}
}
