import MapView, { Callout, Marker } from "react-native-maps";
import { StyleSheet, Text, View } from "react-native";
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

const CENTRO_COLON: Coordenadas = {
  latitud: -32.2148,
  longitud: -58.1419,
};

export default function MapaLugares({
  lugares,
  ubicacionUsuario,
  alSeleccionarLugar,
}: PropsMapaLugares) {
  const centro = ubicacionUsuario || CENTRO_COLON;

  return (
    <View style={styles.contenedorMapa}>
      <MapView
        style={styles.mapa}
        initialRegion={{
          latitude: centro.latitud,
          longitude: centro.longitud,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        }}
        showsUserLocation={Boolean(ubicacionUsuario)}
        showsMyLocationButton
      >
        {lugares.map((lugar) => {
          const distanciaTexto = ubicacionUsuario
            ? formatearDistancia(
                calcularDistanciaMetros(ubicacionUsuario, lugar.coordenadas),
              )
            : lugar.direccion;

          return (
            <Marker
              key={lugar.id}
              coordinate={{
                latitude: lugar.coordenadas.latitud,
                longitude: lugar.coordenadas.longitud,
              }}
              title={lugar.nombre}
              description={`${distanciaTexto} · Tocá para ver detalle`}
              onCalloutPress={() => alSeleccionarLugar(lugar.id)}
            >
              <Callout onPress={() => alSeleccionarLugar(lugar.id)}>
                <View style={styles.callout}>
                  <Text style={styles.tituloCallout}>{lugar.nombre}</Text>
                  <Text style={styles.distanciaCallout}>{distanciaTexto}</Text>
                  <Text style={styles.accionCallout}>Ver detalle →</Text>
                </View>
              </Callout>
            </Marker>
          );
        })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedorMapa: {
    height: 210,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DCE1E7",
    marginBottom: 12,
  },
  mapa: {
    width: "100%",
    height: "100%",
  },
  callout: {
    minWidth: 150,
    padding: 4,
  },
  tituloCallout: {
    fontWeight: "700",
    fontSize: 14,
    color: "#1B2631",
  },
  distanciaCallout: {
    fontSize: 13,
    color: "#4D5656",
    marginTop: 2,
  },
  accionCallout: {
    fontSize: 12,
    color: "#2E86C1",
    fontWeight: "700",
    marginTop: 4,
  },
});
