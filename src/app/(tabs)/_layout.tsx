import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Tabs } from "expo-router";

export default function LayoutPestanas() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#1B4F72",
        tabBarInactiveTintColor: "#5D6D7E",
        tabBarLabelStyle: {
          fontSize: 13,
          fontWeight: "700",
        },
        tabBarStyle: {
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
          backgroundColor: "#FFFFFF",
          borderTopColor: "#DCE1E7",
        },
        headerStyle: {
          backgroundColor: "#1B4F72",
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
