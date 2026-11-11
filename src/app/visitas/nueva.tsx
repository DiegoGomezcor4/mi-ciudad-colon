import { Ionicons } from "@react-native-vector-icons/ionicons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  calcularDistanciaMetros,
  formatearDistancia,
  obtenerLugares,
  obtenerLugarPorQr,
} from "../../servicios/lugares";
import { registrarNuevaVisita } from "../../servicios/visitas";
import { Lugar, OrigenVisita } from "../../tipos";

export default function PantallaNuevaVisita() {
  const { lugarId: lugarIdParam } = useLocalSearchParams<{
    lugarId?: string;
  }>();
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [lugarSeleccionadoId, setLugarSeleccionadoId] = useState<string>(
    lugarIdParam || "lug-004",
  );
  const [origen, setOrigen] = useState<OrigenVisita>("manual");
  const [mostrarEscanerQr, setMostrarEscanerQr] = useState(false);
  const [escaneadoReciente, setEscaneadoReciente] = useState(false);
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [permisoCamara, pedirPermisoCamara] = useCameraPermissions();

  useEffect(() => {
    obtenerLugares()
      .then((res) => {
        setLugares(res.datos);
        if (lugarIdParam) {
          setLugarSeleccionadoId(lugarIdParam);
        } else if (res.datos.length > 0) {
          setLugarSeleccionadoId(res.datos[0].id);
        }
      })
      .catch(() => {});
  }, [lugarIdParam]);

  // 1. Modo QR con CameraView (validando que códigos ajenos o rotos no cuelguen la app - PDF pág. 2)
  const abrirEscanerQr = async () => {
    const perm = permisoCamara?.granted
      ? permisoCamara
      : await pedirPermisoCamara();
    if (!perm?.granted) {
      Alert.alert(
        "Permiso de cámara denegado",
        "No te preocupes: podés registrar tu visita por cercanía GPS o eligiéndola manualmente.",
      );
      return;
    }
    setEscaneadoReciente(false);
    setMostrarEscanerQr(true);
  };

  const manejarLecturaQr = async (datosQr: string) => {
    if (escaneadoReciente) return;
    setEscaneadoReciente(true);

    try {
      const res = await obtenerLugarPorQr(datosQr);
      setLugarSeleccionadoId(res.datos.id);
      setOrigen("qr");
      setMostrarEscanerQr(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "¡Cartel QR reconocido!",
        `Se detectó ${res.datos.nombre}. Podés sumar una foto o nota antes de guardar.`,
      );
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        "Código QR no válido",
        "Ese código QR no pertenece a los carteles de turismo de Colón o está dañado. Podés intentar de nuevo o elegir el lugar de la lista.",
        [
          {
            text: "Reintentar",
            onPress: () => setEscaneadoReciente(false),
          },
          {
            text: "Cerrar cámara",
            onPress: () => setMostrarEscanerQr(false),
          },
        ],
      );
    }
  };

  // 2. Modo GPS por cercanía física
  const verificarCercaniaGps = async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Ubicación desactivada",
          "Para validar por GPS necesitamos permiso de ubicación, o podés registrarla manualmente.",
        );
        return;
      }

      const pos = await Location.getCurrentPositionAsync({});
      const miCoord = {
        latitud: pos.coords.latitude,
        longitud: pos.coords.longitude,
      };

      if (lugares.length === 0) return;

      const ordenados = [...lugares].sort(
        (a, b) =>
          calcularDistanciaMetros(miCoord, a.coordenadas) -
          calcularDistanciaMetros(miCoord, b.coordenadas),
      );
      const masCercano = ordenados[0];
      const dist = calcularDistanciaMetros(miCoord, masCercano.coordenadas);

      setLugarSeleccionadoId(masCercano.id);
      setOrigen("gps");
      await Haptics.selectionAsync();
      Alert.alert(
        "Ubicación GPS detectada",
        `El lugar más cercano a tu posición es ${masCercano.nombre} (${formatearDistancia(dist)}).`,
      );
    } catch {
      Alert.alert("Aviso", "No se pudo obtener la señal GPS en este momento.");
    }
  };

  // 3. Tomar foto con cámara o elegir de la galería (expo-image-picker)
  const sacarFotoConCamara = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permiso requerido", "Habilitá la cámara para sacar una foto.");
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        allowsEditing: true,
      });
      if (!res.canceled && res.assets.length > 0) {
        setFotoUri(res.assets[0].uri);
      }
    } catch {
      Alert.alert("Error", "No se pudo abrir la cámara.");
    }
  };

  const elegirFotoDeGaleria = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permiso requerido",
          "Habilitá el acceso a tus fotos para elegir una imagen.",
        );
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        allowsEditing: true,
      });
      if (!res.canceled && res.assets.length > 0) {
        setFotoUri(res.assets[0].uri);
      }
    } catch {
      Alert.alert("Error", "No se pudo abrir la galería.");
    }
  };

  const guardarVisita = async () => {
    if (!lugarSeleccionadoId) return;
    try {
      setGuardando(true);
      await registrarNuevaVisita({
        lugarId: lugarSeleccionadoId,
        origen,
        fotoUri,
        nota,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "¡Visita registrada!",
        "Se guardó en tu recorrido (y quedará sincronizada apenas tengas señal).",
        [{ text: "Ver mi recorrido", onPress: () => router.back() }],
      );
    } catch {
      Alert.alert("Error", "No se pudo guardar la visita.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ScrollView style={styles.contenedor}>
      <Text style={styles.subtitulo}>
        1. ¿Cómo querés registrar que estuviste acá?
      </Text>

      <View style={styles.filaModos}>
        <Pressable
          style={[styles.botonModo, origen === "qr" && styles.modoActivo]}
          onPress={abrirEscanerQr}
        >
          <Ionicons
            name="qr-code-outline"
            size={22}
            color={origen === "qr" ? "#FFFFFF" : "#1B4F72"}
          />
          <Text
            style={[
              styles.textoBotonModo,
              origen === "qr" && styles.textoModoActivo,
            ]}
          >
            Escanear QR
          </Text>
        </Pressable>

        <Pressable
          style={[styles.botonModo, origen === "gps" && styles.modoActivo]}
          onPress={verificarCercaniaGps}
        >
          <Ionicons
            name="locate-outline"
            size={22}
            color={origen === "gps" ? "#FFFFFF" : "#1B4F72"}
          />
          <Text
            style={[
              styles.textoBotonModo,
              origen === "gps" && styles.textoModoActivo,
            ]}
          >
            Estoy cerca (GPS)
          </Text>
        </Pressable>

        <Pressable
          style={[styles.botonModo, origen === "manual" && styles.modoActivo]}
          onPress={() => {
            setOrigen("manual");
            setMostrarEscanerQr(false);
          }}
        >
          <Ionicons
            name="hand-left-outline"
            size={22}
            color={origen === "manual" ? "#FFFFFF" : "#1B4F72"}
          />
          <Text
            style={[
              styles.textoBotonModo,
              origen === "manual" && styles.textoModoActivo,
            ]}
          >
            A mano
          </Text>
        </Pressable>
      </View>

      {mostrarEscanerQr && (
        <View style={styles.cajaCamaraQr}>
          <CameraView
            style={styles.vistaCamara}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={(resultado) => manejarLecturaQr(resultado.data)}
          />
          <Text style={styles.ayudaQr}>
            Apuntá al código QR del cartel turístico (ej. COLON:lug-004)
          </Text>
          <Pressable
            style={styles.botonCerrarQr}
            onPress={() => setMostrarEscanerQr(false)}
          >
            <Text style={styles.textoCerrarQr}>Cerrar escáner</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.subtitulo}>2. Lugar visitado</Text>
      <View style={styles.listaLugares}>
        {lugares.map((lug) => {
          const seleccionado = lug.id === lugarSeleccionadoId;
          return (
            <Pressable
              key={lug.id}
              style={[
                styles.itemLugar,
                seleccionado && styles.itemLugarActivo,
              ]}
              onPress={() => setLugarSeleccionadoId(lug.id)}
            >
              <Text
                style={[
                  styles.textoItemLugar,
                  seleccionado && styles.textoItemLugarActivo,
                ]}
              >
                {seleccionado ? "✓ " : ""}
                {lug.nombre}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.subtitulo}>3. Sumá una foto de tu visita</Text>
      <View style={styles.filaFotos}>
        <Pressable style={styles.botonFoto} onPress={sacarFotoConCamara}>
          <Ionicons name="camera-outline" size={20} color="#1B4F72" />
          <Text style={styles.textoBotonFoto}>Sacar foto</Text>
        </Pressable>

        <Pressable style={styles.botonFoto} onPress={elegirFotoDeGaleria}>
          <Ionicons name="images-outline" size={20} color="#1B4F72" />
          <Text style={styles.textoBotonFoto}>Elegir de galería</Text>
        </Pressable>
      </View>

      {fotoUri && (
        <View style={styles.previewFotoContenedor}>
          <Image
            source={{ uri: fotoUri }}
            style={styles.previewFoto}
            contentFit="cover"
          />
          <Pressable
            style={styles.quitarFoto}
            onPress={() => setFotoUri(null)}
          >
            <Text style={styles.textoQuitarFoto}>Quitar foto</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.subtitulo}>4. Escribí una nota corta</Text>
      <TextInput
        style={styles.inputNota}
        placeholder="Ej: Hacía 35 grados pero el río estaba espectacular..."
        placeholderTextColor="#7F8C8D"
        value={nota}
        onChangeText={setNota}
        multiline
        maxLength={220}
      />

      <Pressable
        style={styles.botonGuardar}
        onPress={guardarVisita}
        disabled={guardando}
      >
        <Text style={styles.textoBotonGuardar}>
          {guardando ? "Guardando..." : "Guardar en Mi Recorrido"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: "#F4F6F8",
    padding: 16,
  },
  subtitulo: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1B2631",
    marginBottom: 10,
    marginTop: 6,
  },
  filaModos: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  botonModo: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#1B4F72",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    gap: 4,
  },
  modoActivo: {
    backgroundColor: "#1B4F72",
  },
  textoBotonModo: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1B4F72",
    textAlign: "center",
  },
  textoModoActivo: {
    color: "#FFFFFF",
  },
  cajaCamaraQr: {
    backgroundColor: "#1B2631",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 16,
    paddingBottom: 12,
  },
  vistaCamara: {
    width: "100%",
    height: 230,
  },
  ayudaQr: {
    color: "#FFFFFF",
    textAlign: "center",
    fontSize: 13,
    marginTop: 8,
    paddingHorizontal: 10,
  },
  botonCerrarQr: {
    alignSelf: "center",
    marginTop: 8,
    backgroundColor: "#C0392B",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  textoCerrarQr: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  listaLugares: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  itemLugar: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CFD8DC",
  },
  itemLugarActivo: {
    backgroundColor: "#1B4F72",
    borderColor: "#1B4F72",
  },
  textoItemLugar: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2C3E50",
  },
  textoItemLugarActivo: {
    color: "#FFFFFF",
  },
  filaFotos: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  botonFoto: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#1B4F72",
    borderRadius: 10,
    paddingVertical: 12,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  textoBotonFoto: {
    color: "#1B4F72",
    fontWeight: "700",
    fontSize: 14,
  },
  previewFotoContenedor: {
    marginBottom: 14,
  },
  previewFoto: {
    width: "100%",
    height: 180,
    borderRadius: 12,
  },
  quitarFoto: {
    marginTop: 6,
    alignSelf: "flex-end",
  },
  textoQuitarFoto: {
    color: "#C0392B",
    fontWeight: "700",
  },
  inputNota: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CFD8DC",
    padding: 12,
    fontSize: 16,
    color: "#1B2631",
    minHeight: 90,
    textAlignVertical: "top",
    marginBottom: 20,
  },
  botonGuardar: {
    backgroundColor: "#1E8449",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 32,
  },
  textoBotonGuardar: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },
});
