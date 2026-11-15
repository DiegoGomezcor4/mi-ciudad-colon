import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useTema } from "../servicios/tema";

// Escudo global contra excepciones no capturadas en producción para evitar que Android cierre el proceso de la app
const globalAny = globalThis as unknown as {
  ErrorUtils?: {
    getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
    setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
  };
};

if (globalAny.ErrorUtils?.setGlobalHandler) {
  const manejadorAnterior = globalAny.ErrorUtils.getGlobalHandler?.();
  globalAny.ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.warn("[MiCiudadColon] Error interceptado:", error, { isFatal });
    if (!isFatal && manejadorAnterior) {
      try {
        manejadorAnterior(error, false);
      } catch {}
    }
  });
}

export { ErrorBoundary } from "expo-router";

export default function RootLayout() {
  const { esOscuro, colores } = useTema();

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colores.encabezado },
          headerTintColor: "#FFFFFF",
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: colores.fondo },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="lugares/[id]"
          options={{
            title: "Detalle del lugar",
            headerStyle: { backgroundColor: esOscuro ? "#0B1120" : "#1B4F72" },
          }}
        />
        <Stack.Screen
          name="eventos/[id]"
          options={{
            title: "Detalle del evento",
            headerStyle: { backgroundColor: esOscuro ? "#0B1120" : "#1B4F72" },
          }}
        />
        <Stack.Screen
          name="visitas/nueva"
          options={{
            title: "Registrar visita",
            headerStyle: { backgroundColor: esOscuro ? "#0B1120" : "#1B4F72" },
          }}
        />
      </Stack>
    </>
  );
}
