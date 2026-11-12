import { Stack } from "expo-router";

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
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="lugares/[id]"
        options={{ title: "Detalle del lugar" }}
      />
      <Stack.Screen
        name="eventos/[id]"
        options={{ title: "Detalle del evento" }}
      />
      <Stack.Screen
        name="visitas/nueva"
        options={{ title: "Registrar visita" }}
      />
    </Stack>
  );
}
