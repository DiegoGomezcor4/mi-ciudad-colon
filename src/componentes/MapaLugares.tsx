import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useState } from "react";
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

// Límites geográficos de Colón y alrededores para proyectar coordenadas GPS reales en el plano interactivo
const LAT_MIN = -32.245;
const LAT_MAX = -32.195;
const LON_MIN = -58.245;
const LON_MAX = -58.125;

function proyectarCoordenada(coord: Coordenadas): {
  leftPct: number;
  topPct: number;
} {
  const x = (coord.longitud - LON_MIN) / (LON_MAX - LON_MIN);
  const y = 1 - (coord.latitud - LAT_MIN) / (LAT_MAX - LAT_MIN);
  const leftPct = Math.min(90, Math.max(8, x * 100));
  const topPct = Math.min(86, Math.max(12, y * 100));
  return { leftPct, topPct };
}

export default function MapaLugares({
  lugares,
  ubicacionUsuario,
  alSeleccionarLugar,
}: PropsMapaLugares) {
  const [lugarPinActivo, setLugarPinActivo] = useState<Lugar | null>(
    lugares[0] || null,
  );

  return (
    <View style={styles.contenedorMapa}>
      <View style={styles.lienzoPlano}>
        {/* Franja costera del Río Uruguay al este */}
        <View style={styles.rioUruguay}>
          <Text style={styles.textoRio}>Río Uruguay</Text>
        </View>

        <Text style={styles.etiquetaMapa}>
          🗺️ Mapa GPS de Colón ({lugares.length} puntos)
        </Text>

        {/* Punto azul de ubicación actual del usuario */}
        {ubicacionUsuario && (
          <View
            style={[
              styles.puntoUsuario,
              {
                left: `${proyectarCoordenada(ubicacionUsuario).leftPct}%`,
                top: `${proyectarCoordenada(ubicacionUsuario).topPct}%`,
              },
            ]}
          />
        )}

        {/* Marcadores interactivos según latitud y longitud real */}
        {lugares.map((lugar) => {
          const pos = proyectarCoordenada(lugar.coordenadas);
          const seleccionado = lugarPinActivo?.id === lugar.id;
          return (
            <Pressable
              key={lugar.id}
              style={[
                styles.pinLugar,
                { left: `${pos.leftPct}%`, top: `${pos.topPct}%` },
                seleccionado && styles.pinLugarActivo,
              ]}
              onPress={() => setLugarPinActivo(lugar)}
            >
              <Ionicons
                name="location"
                size={seleccionado ? 22 : 18}
                color={seleccionado ? "#C0392B" : "#1B4F72"}
              />
            </Pressable>
          );
        })}

        {/* Tarjeta flotante (Callout) al tocar un marcador */}
        {lugarPinActivo && (
          <Pressable
            style={styles.calloutFlotante}
            onPress={() => alSeleccionarLugar(lugarPinActivo.id)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.tituloCallout} numberOfLines={1}>
                📍 {lugarPinActivo.nombre}
              </Text>
              <Text style={styles.distanciaCallout} numberOfLines={1}>
                {ubicacionUsuario
                  ? `${formatearDistancia(
                      calcularDistanciaMetros(
                        ubicacionUsuario,
                        lugarPinActivo.coordenadas,
                      ),
                    )} · ${lugarPinActivo.direccion}`
                  : lugarPinActivo.direccion}
              </Text>
            </View>
            <Text style={styles.accionCallout}>Ver detalle →</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedorMapa: {
    height: 220,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#AED6F1",
    marginBottom: 12,
    backgroundColor: "#EBF5FB",
  },
  lienzoPlano: {
    flex: 1,
    position: "relative",
    backgroundColor: "#EAF2F8",
  },
  rioUruguay: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "22%",
    backgroundColor: "#AED6F1",
    justifyContent: "center",
    alignItems: "center",
    borderLeftWidth: 1,
    borderLeftColor: "#85C1E9",
  },
  textoRio: {
    fontSize: 11,
    fontWeight: "800",
    color: "#1B4F72",
    transform: [{ rotate: "-90deg" }],
  },
  etiquetaMapa: {
    position: "absolute",
    top: 8,
    left: 10,
    fontSize: 12,
    fontWeight: "800",
    color: "#1B4F72",
    backgroundColor: "rgba(255,255,255,0.88)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  pinLugar: {
    position: "absolute",
    marginLeft: -12,
    marginTop: -20,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 3,
    borderWidth: 1,
    borderColor: "#1B4F72",
    elevation: 3,
  },
  pinLugarActivo: {
    backgroundColor: "#FDEDEC",
    borderColor: "#C0392B",
    transform: [{ scale: 1.15 }],
    zIndex: 10,
  },
  puntoUsuario: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#2E86C1",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    zIndex: 5,
  },
  calloutFlotante: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#DCE1E7",
    elevation: 4,
    gap: 8,
  },
  tituloCallout: {
    fontWeight: "800",
    fontSize: 14,
    color: "#1B2631",
  },
  distanciaCallout: {
    fontSize: 12,
    color: "#4D5656",
    marginTop: 2,
  },
  accionCallout: {
    fontSize: 13,
    color: "#1B4F72",
    fontWeight: "800",
  },
});
