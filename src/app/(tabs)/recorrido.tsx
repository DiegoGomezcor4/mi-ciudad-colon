import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { obtenerLugares } from "../../servicios/lugares";
import { useTema } from "../../servicios/tema";
import {
  actualizarVisitaExistente,
  obtenerMisVisitas,
  sincronizarVisitasPendientes,
} from "../../servicios/visitas";
import { Lugar, Visita } from "../../tipos";

export default function PantallaRecorrido() {
  const { esOscuro, colores } = useTema();
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [notaEdicion, setNotaEdicion] = useState("");
  const [fotoEdicionUri, setFotoEdicionUri] = useState<string | null>(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  const cargarRecorrido = useCallback(async () => {
    try {
      setCargando(true);
      const [resVisitas, resLugares] = await Promise.all([
        obtenerMisVisitas().catch(() => ({ datos: [], meta: null })),
        obtenerLugares().catch(() => ({ datos: [], meta: null })),
      ]);
      setVisitas(resVisitas.datos);
      setLugares(resLugares.datos);
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargarRecorrido();
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
        "Aviso de sincronización",
        err instanceof Error
          ? err.message
          : "No se pudo sincronizar en este momento.",
      );
    } finally {
      setSincronizando(false);
    }
  };

  const iniciarEdicion = (visita: Visita) => {
    setEditandoId(visita.id);
    setNotaEdicion(visita.nota || "");
    setFotoEdicionUri(visita.fotoUri);
  };

  const elegirFotoEdicion = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permiso requerido",
          "Habilitá el acceso a tus fotos para adjuntar una imagen.",
        );
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        allowsEditing: true,
      });
      if (!res.canceled && res.assets.length > 0) {
        setFotoEdicionUri(res.assets[0].uri);
      }
    } catch {}
  };

  const guardarEdicion = async (visitaId: string) => {
    try {
      setGuardandoEdicion(true);
      await actualizarVisitaExistente(visitaId, {
        nota: notaEdicion,
        fotoUri: fotoEdicionUri,
      });
      setEditandoId(null);
      await cargarRecorrido();
    } catch {
      Alert.alert("Error", "No se pudieron guardar los cambios de la visita.");
    } finally {
      setGuardandoEdicion(false);
    }
  };

  if (cargando) {
    return (
      <View style={[styles.centrado, { backgroundColor: colores.fondo }]}>
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }

  return (
    <View style={[styles.contenedor, { backgroundColor: colores.fondo }]}>
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
            style={[
              styles.botonSincronizar,
              esOscuro && {
                backgroundColor: "#422006",
                borderColor: "#854D0E",
              },
            ]}
            onPress={manejarSincronizar}
            disabled={sincronizando}
          >
            <Ionicons
              name="cloud-upload-outline"
              size={18}
              color={esOscuro ? "#FDE047" : "#7D6608"}
            />
            <Text
              style={[
                styles.textoSincronizar,
                esOscuro && { color: "#FEF08A" },
              ]}
            >
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
          <Text
            style={[styles.textoVacio, { color: colores.textoSecundario }]}
          >
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
              style={[
                styles.tarjeta,
                {
                  backgroundColor: colores.tarjeta,
                  borderColor: colores.borde,
                },
              ]}
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

              <Text style={[styles.tituloLugar, { color: colores.texto }]}>
                {lugar ? lugar.nombre : `Lugar ${item.lugarId}`}
              </Text>
              <Text
                style={[styles.fecha, { color: colores.textoSecundario }]}
              >
                {fechaTexto}
              </Text>

              {item.fotoUri && (
                <Image
                  source={{ uri: item.fotoUri }}
                  style={styles.fotoVisita}
                  contentFit="cover"
                />
              )}

              {item.nota && editandoId !== item.id && (
                <Text
                  style={[
                    styles.nota,
                    {
                      backgroundColor: esOscuro ? "#0F172A" : "#F8F9FA",
                      color: colores.texto,
                    },
                  ]}
                >
                  “{item.nota}”
                </Text>
              )}

              {editandoId === item.id ? (
                <View
                  style={[
                    styles.cajaEdicion,
                    {
                      backgroundColor: colores.fondo,
                      borderColor: colores.borde,
                    },
                  ]}
                >
                  <TextInput
                    style={[
                      styles.inputEdicion,
                      {
                        backgroundColor: colores.tarjeta,
                        borderColor: colores.borde,
                        color: colores.texto,
                      },
                    ]}
                    placeholder="Agregá o editá tu nota de la visita..."
                    placeholderTextColor={colores.textoSecundario}
                    value={notaEdicion}
                    onChangeText={setNotaEdicion}
                    multiline
                  />
                  <View style={styles.filaBotonesEdicion}>
                    <Pressable
                      style={[
                        styles.botonAccionEdicion,
                        { borderColor: colores.primario },
                      ]}
                      onPress={elegirFotoEdicion}
                    >
                      <Ionicons
                        name="image-outline"
                        size={15}
                        color={colores.primario}
                      />
                      <Text
                        style={[
                          styles.textoAccionEdicion,
                          { color: colores.primario },
                        ]}
                      >
                        {fotoEdicionUri ? "Cambiar foto" : "Sumar foto"}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[
                        styles.botonAccionEdicion,
                        { borderColor: colores.borde },
                      ]}
                      onPress={() => setEditandoId(null)}
                    >
                      <Text
                        style={[
                          styles.textoAccionEdicion,
                          { color: colores.textoSecundario },
                        ]}
                      >
                        Cancelar
                      </Text>
                    </Pressable>

                    <Pressable
                      style={styles.botonGuardarEdicion}
                      onPress={() => void guardarEdicion(item.id)}
                      disabled={guardandoEdicion}
                    >
                      <Text style={styles.textoGuardarEdicion}>
                        {guardandoEdicion ? "Guardando..." : "Guardar"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  style={styles.botonEditarInline}
                  onPress={() => iniciarEdicion(item)}
                >
                  <Ionicons
                    name="create-outline"
                    size={15}
                    color={colores.primario}
                  />
                  <Text
                    style={[
                      styles.textoEditarInline,
                      { color: colores.primario },
                    ]}
                  >
                    {item.nota || item.fotoUri
                      ? "Editar nota o foto"
                      : "Agregar nota o foto"}
                  </Text>
                </Pressable>
              )}
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
  botonEditarInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
    alignSelf: "flex-start",
  },
  textoEditarInline: {
    fontSize: 13,
    fontWeight: "700",
  },
  cajaEdicion: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  inputEdicion: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 64,
    textAlignVertical: "top",
  },
  filaBotonesEdicion: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  botonAccionEdicion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  textoAccionEdicion: {
    fontSize: 12,
    fontWeight: "700",
  },
  botonGuardarEdicion: {
    backgroundColor: "#1E8449",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  textoGuardarEdicion: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
});
