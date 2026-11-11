import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  calcularDistanciaMetros,
  formatearDistancia,
} from "../servicios/lugares";
import { Coordenadas, Lugar } from "../tipos";

interface PropsMapaLugares {
  lugares: Lugar[];
  ubicacionUsuario: Coordenadas | null;
  alSeleccionarLugar: (lugarId: string) => void;
}

export default function MapaLugares({
  lugares,
  ubicacionUsuario,
  alSeleccionarLugar,
}: PropsMapaLugares) {
  return (
    <View style={styles.contenedorMapa}>
      <Text style={styles.tituloMapa}>
        🗺️ Mapa de Colón ({lugares.length} marcadores activos)
      </Text>
      <View style={styles.listaMarcadores}>
        {lugares.map((lugar) => {
          const dist = ubicacionUsuario
            ? formatearDistancia(
                calcularDistanciaMetros(ubicacionUsuario, lugar.coordenadas),
              )
            : null;
          return (
            <Pressable
              key={lugar.id}
              style={styles.pin}
              onPress={() => alSeleccionarLugar(lugar.id)}
            >
              <Text style={styles.textoPin}>
                📍 {lugar.nombre} {dist ? `(${dist})` : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedorMapa: {
    backgroundColor: "#EBF5FB",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#AED6F1",
    marginBottom: 12,
  },
  tituloMapa: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1B4F72",
    marginBottom: 8,
  },
  listaMarcadores: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pin: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2E86C1",
  },
  textoPin: {
    fontSize: 13,
    color: "#1B4F72",
    fontWeight: "600",
  },
});
