import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTema } from "../../servicios/tema";

export default function LayoutPestanas() {
  const insets = useSafeAreaInsets();
  const { colores } = useTema();
  const paddingInferior = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colores.primario,
        tabBarInactiveTintColor: colores.textoSecundario,
        tabBarLabelStyle: {
          fontSize: 13,
          fontWeight: "700",
        },
        tabBarStyle: {
          height: 60 + paddingInferior,
          paddingBottom: paddingInferior + 4,
          paddingTop: 6,
          backgroundColor: colores.tabBarra,
          borderTopColor: colores.borde,
        },
        headerStyle: {
          backgroundColor: colores.encabezado,
        },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: {
          fontWeight: "700",
          fontSize: 18,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Mapa",
          headerTitle: "Mi Ciudad Colón",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="agenda"
        options={{
          title: "Agenda",
          headerTitle: "Agenda de Eventos",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="recorrido"
        options={{
          title: "Mi recorrido",
          headerTitle: "Mi Recorrido",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="camera-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: "Yo",
          headerTitle: "Favoritos y Cuenta",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
