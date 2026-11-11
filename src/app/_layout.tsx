import { Stack } from "expo-router";

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
