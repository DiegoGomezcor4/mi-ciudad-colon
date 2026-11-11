import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { obtenerLugares } from "../../servicios/lugares";
import {
  obtenerMisVisitas,
  sincronizarVisitasPendientes,
} from "../../servicios/visitas";
import { Lugar, Visita } from "../../tipos";

export default function PantallaRecorrido() {
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargarRecorrido = useCallback(async () => {
    try {
      setCargando(true);
      const [resVisitas, resLugares] = await Promise.all([
        obtenerMisVisitas(),
        obtenerLugares(),
      ]);
      setVisitas(resVisitas.datos);
      setLugares(resLugares.datos);
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargarRecorrido();
    }, [cargarRecorrido]),
  );

  const pendientes = visitas.filter((v) => !v.sincronizada).length;

  const manejarSincronizar = async () => {
    try {
      setSincronizando(true);
      const resultado = await sincronizarVisitasPendientes();
      await cargarRecorrido();
      Alert.alert(
        "Sincronización completada",
        `Se subieron ${resultado.sincronizadasAhora} visitas pendientes al servidor.`,
      );
    } catch (err) {
      Alert.alert(
        "Sin señal",
        err instanceof Error
          ? err.message
          : "No se pudo sincronizar en este momento.",
      );
    } finally {
      setSincronizando(false);
    }
  };

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator size="large" color="#1B4F72" />
      </View>
    );
  }

  return (
    <View style={styles.contenedor}>
      {/* Botones superiores: Registrar nueva visita (QR/GPS/Manual) y Sincronizar cola offline */}
      <View style={styles.barraAcciones}>
        <Pressable
          style={styles.botonRegistrar}
          onPress={() => router.push("/visitas/nueva")}
        >
          <Ionicons name="qr-code-outline" size={20} color="#FFFFFF" />
          <Text style={styles.textoBotonRegistrar}>
            Registrar visita (QR / GPS / Manual)
          </Text>
        </Pressable>

        {pendientes > 0 && (
          <Pressable
            style={styles.botonSincronizar}
            onPress={manejarSincronizar}
            disabled={sincronizando}
          >
            <Ionicons name="cloud-upload-outline" size={18} color="#7D6608" />
            <Text style={styles.textoSincronizar}>
              {sincronizando
                ? "Sincronizando cola local..."
                : `${pendientes} visita(s) guardada(s) sin señal · Tocá para subir`}
            </Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={visitas}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={styles.textoVacio}>
            Todavía no registraste visitas en tu recorrido por Colón.
          </Text>
        }
        renderItem={({ item }) => {
          const lugar = lugares.find((l) => l.id === item.lugarId);
          const fechaTexto = new Date(item.fechaHora).toLocaleDateString(
            "es-AR",
            {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            },
          );

          return (
            <Pressable
              style={styles.tarjeta}
              onPress={() =>
                lugar ? router.push(`/lugares/${lugar.id}`) : undefined
              }
            >
              <View style={styles.filaEncabezado}>
                <Text style={styles.origenBadge}>
                  Origen: {item.origen.toUpperCase()}
                </Text>
                <Text
                  style={[
                    styles.estadoSincronizacion,
                    item.sincronizada
                      ? styles.sincronizadaOk
                      : styles.pendienteOffline,
                  ]}
                >
                  {item.sincronizada
                    ? "✓ Sincronizada"
                    : "⏳ En cola local (sin señal)"}
                </Text>
              </View>

              <Text style={styles.tituloLugar}>
                {lugar ? lugar.nombre : `Lugar ${item.lugarId}`}
              </Text>
              <Text style={styles.fecha}>{fechaTexto}</Text>

              {item.fotoUri && (
                <Image
                  source={{ uri: item.fotoUri }}
                  style={styles.fotoVisita}
                  contentFit="cover"
                />
              )}

              {item.nota && <Text style={styles.nota}>“{item.nota}”</Text>}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: "#F4F6F8",
    padding: 14,
  },
  centrado: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  barraAcciones: {
    gap: 10,
    marginBottom: 14,
  },
  botonRegistrar: {
    flexDirection: "row",
    backgroundColor: "#1E8449",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  textoBotonRegistrar: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  botonSincronizar: {
    flexDirection: "row",
    backgroundColor: "#FEF9E7",
    borderColor: "#F7DC6F",
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    gap: 8,
  },
  textoSincronizar: {
    flex: 1,
    color: "#7D6608",
    fontSize: 13,
    fontWeight: "700",
  },
  textoVacio: {
    textAlign: "center",
    color: "#5D6D7E",
    marginTop: 32,
    fontSize: 16,
  },
  tarjeta: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#DCE1E7",
  },
  filaEncabezado: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  origenBadge: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1B4F72",
    backgroundColor: "#D6EAF8",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  estadoSincronizacion: {
    fontSize: 12,
    fontWeight: "700",
  },
  sincronizadaOk: {
    color: "#1E8449",
  },
  pendienteOffline: {
    color: "#B7950B",
  },
  tituloLugar: {
    fontSize: 19,
    fontWeight: "800",
    color: "#1B2631",
    marginBottom: 2,
  },
  fecha: {
    fontSize: 13,
    color: "#5D6D7E",
    marginBottom: 8,
  },
  fotoVisita: {
    width: "100%",
    height: 180,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: "#E5E8EC",
  },
  nota: {
    fontSize: 15,
    fontStyle: "italic",
    color: "#2C3E50",
    backgroundColor: "#F8F9FA",
    padding: 10,
    borderRadius: 8,
  },
});
