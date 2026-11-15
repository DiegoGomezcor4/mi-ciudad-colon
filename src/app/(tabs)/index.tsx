import { Ionicons } from "@react-native-vector-icons/ionicons";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MapaLugares from "../../componentes/MapaLugares";
import {
  monitorearConexionApi,
  verificarSaludApi,
} from "../../servicios/api";
import {
  calcularDistanciaMetros,
  formatearDistancia,
  obtenerCategorias,
  obtenerLugares,
} from "../../servicios/lugares";
import { verificarYNotificarProximidad } from "../../servicios/notificaciones";
import {
  cambiarSimularGpsColon,
  obtenerSimularGpsColonSincrono,
  suscribirSimularGpsColon,
  UBICACION_DEMO_COLON,
} from "../../servicios/preferencias";
import { useTema } from "../../servicios/tema";
import { Categoria, Coordenadas, Lugar, OrigenDatos } from "../../tipos";

export default function PantallaMapaYLugares() {
  const { esOscuro, colores } = useTema();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<
    string | undefined
  >(undefined);
  const [soloAccesibles, setSoloAccesibles] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [ordenarPorDistancia, setOrdenarPorDistancia] = useState(true);
  const [mostrarMapa, setMostrarMapa] = useState(true);
  const [interactuandoMapa, setInteractuandoMapa] = useState(false);
  const [ubicacionGpsReal, setUbicacionGpsReal] =
    useState<Coordenadas | null>(null);
  const [simularEnColon, setSimularEnColon] = useState<boolean>(() =>
    obtenerSimularGpsColonSincrono(),
  );
  const [permisoUbicacionDenegado, setPermisoUbicacionDenegado] =
    useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recargaTick, setRecargaTick] = useState(0);
  const [origenDatos, setOrigenDatos] = useState<OrigenDatos>("api");
  const [apiConectadaEnVivo, setApiConectadaEnVivo] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    return suscribirSimularGpsColon(setSimularEnColon);
  }, []);

  const ubicacionUsuario: Coordenadas | null = simularEnColon
    ? UBICACION_DEMO_COLON
    : ubicacionGpsReal;

  const solicitarUbicacionGps = useCallback(async (): Promise<Coordenadas | null> => {
    try {
      const permiso = await Location.requestForegroundPermissionsAsync();
      if (permiso.status !== "granted") {
        setPermisoUbicacionDenegado(true);
        return null;
      }
      setPermisoUbicacionDenegado(false);
      const posicion = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords: Coordenadas = {
        latitud: posicion.coords.latitude,
        longitud: posicion.coords.longitude,
      };
      setUbicacionGpsReal(coords);
      await cambiarSimularGpsColon(false);
      return coords;
    } catch {
      setPermisoUbicacionDenegado(true);
      return null;
    }
  }, []);

  // Monitorear en tiempo real el momento exacto de conexión y desconexión con la API
  useEffect(() => {
    const cancelarMonitoreo = monitorearConexionApi((conectado) => {
      setApiConectadaEnVivo((estadoPrevio) => {
        if (conectado && estadoPrevio === false) {
          obtenerCategorias()
            .then((res) => setCategorias(res.datos))
            .catch(() => {});
          setRecargaTick((t) => t + 1);
        }
        return conectado;
      });
    });
    return cancelarMonitoreo;
  }, []);

  // 1. Cargar categorías y suscribirse en tiempo real al GPS del teléfono
  useEffect(() => {
    obtenerCategorias()
      .then((res) => setCategorias(res.datos))
      .catch(() => {});

    let suscripcionGps: Location.LocationSubscription | null = null;

    (async () => {
      try {
        const permiso = await Location.requestForegroundPermissionsAsync();
        if (permiso.status !== "granted") {
          setPermisoUbicacionDenegado(true);
          return;
        }
        setPermisoUbicacionDenegado(false);
        const posicion = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUbicacionGpsReal({
          latitud: posicion.coords.latitude,
          longitud: posicion.coords.longitude,
        });

        suscripcionGps = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 10,
          },
          (nuevaPos) => {
            setUbicacionGpsReal({
              latitud: nuevaPos.coords.latitude,
              longitud: nuevaPos.coords.longitude,
            });
          },
        );
      } catch {
        setPermisoUbicacionDenegado(true);
      }
    })();

    return () => {
      suscripcionGps?.remove();
    };
  }, []);

  // 2. Cargar lugares según filtros
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const respuesta = await obtenerLugares({
          categoriaId: categoriaSeleccionada,
          accesible: soloAccesibles || undefined,
          q: busqueda.trim() || undefined,
          latitud: ubicacionUsuario?.latitud,
          longitud: ubicacionUsuario?.longitud,
          orden:
            ordenarPorDistancia && ubicacionUsuario ? "distancia" : "nombre",
        });
        if (cancelado) return;
        setLugares(respuesta.datos);
        setOrigenDatos(respuesta.origen ?? "api");
        setError(null);

        if (ubicacionUsuario) {
          for (const lug of respuesta.datos) {
            const dist = calcularDistanciaMetros(
              ubicacionUsuario,
              lug.coordenadas,
            );
            verificarYNotificarProximidad(lug, dist);
          }
        }
      } catch (err) {
        if (cancelado) return;
        setError(
          err instanceof Error
            ? err.message
            : "No se pudieron cargar los lugares.",
        );
      } finally {
        if (!cancelado) {
          setCargando(false);
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [
    categoriaSeleccionada,
    soloAccesibles,
    busqueda,
    ubicacionUsuario,
    ordenarPorDistancia,
    recargaTick,
  ]);

  const lugaresCerca = useMemo(() => {
    if (!ubicacionUsuario) {
      return lugares.slice(0, 3);
    }
    return [...lugares]
      .sort(
        (a, b) =>
          calcularDistanciaMetros(ubicacionUsuario, a.coordenadas) -
          calcularDistanciaMetros(ubicacionUsuario, b.coordenadas),
      )
      .slice(0, 3);
  }, [lugares, ubicacionUsuario]);

  const origenEfectivo: OrigenDatos =
    apiConectadaEnVivo === true
      ? "api"
      : apiConectadaEnVivo === false
        ? origenDatos === "mock"
          ? "mock"
          : "cache"
        : origenDatos;

  const estadoApi = {
    api: {
      color: "#1E8449",
      fondo: "#EAFAF1",
      texto: "Conectado a la API",
    },
    cache: {
      color: "#B9770E",
      fondo: "#FEF5E7",
      texto: "Sin conexión · datos guardados",
    },
    mock: {
      color: "#C0392B",
      fondo: "#FDEDEC",
      texto: "Sin conexión · datos de ejemplo",
    },
  }[origenEfectivo];

  return (
    <View style={[styles.contenedor, { backgroundColor: colores.fondo }]}>
      {/* Fila de indicadores en tiempo real: Conexión API + Estado GPS */}
      <View style={styles.filaBadgesEstado}>
        <Pressable
          style={[styles.badgeEstadoApi, { backgroundColor: estadoApi.fondo }]}
          onPress={() => {
            void verificarSaludApi().then((ok) => {
              if (ok) {
                setRecargaTick((t) => t + 1);
              }
            });
          }}
        >
          <View
            style={[
              styles.puntoEstadoApi,
              { backgroundColor: estadoApi.color },
            ]}
          />
          <Text style={[styles.textoEstadoApi, { color: estadoApi.color }]}>
            {estadoApi.texto}
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.badgeGps,
            simularEnColon
              ? { backgroundColor: "#EDE9FE", borderColor: "#C4B5FD" }
              : ubicacionGpsReal
                ? { backgroundColor: "#DBEAFE", borderColor: "#93C5FD" }
                : { backgroundColor: "#FEF3C7", borderColor: "#FCD34D" },
          ]}
          onPress={() => {
            if (!ubicacionGpsReal && !simularEnColon) {
              void solicitarUbicacionGps();
            } else {
              void cambiarSimularGpsColon(!simularEnColon);
            }
          }}
        >
          <Ionicons
            name={simularEnColon ? "sparkles" : "navigate"}
            size={12}
            color={simularEnColon ? "#6D28D9" : "#1D4ED8"}
          />
          <Text
            style={[
              styles.textoBadgeGps,
              { color: simularEnColon ? "#6D28D9" : "#1E40AF" },
            ]}
          >
            {simularEnColon
              ? "GPS simulado en Colón (tocar para GPS real)"
              : ubicacionGpsReal
                ? "GPS activo (tocar para simular en Colón)"
                : "Activar mi GPS"}
          </Text>
        </Pressable>
      </View>

      {/* Buscador y botón para mostrar/ocultar mapa */}
      <View style={styles.filaSuperior}>
        <View
          style={[
            styles.cajaBuscador,
            {
              backgroundColor: colores.tarjeta,
              borderColor: colores.borde,
            },
          ]}
        >
          <Ionicons
            name="search-outline"
            size={20}
            color={colores.textoSecundario}
          />
          <TextInput
            style={[styles.buscador, { color: colores.texto }]}
            placeholder="Buscar lugar en Colón (ej: Molino, termas)..."
            placeholderTextColor={colores.textoSecundario}
            value={busqueda}
            onChangeText={setBusqueda}
          />
          {busqueda.length > 0 && (
            <Pressable onPress={() => setBusqueda("")}>
              <Ionicons
                name="close-circle"
                size={20}
                color={colores.textoSecundario}
              />
            </Pressable>
          )}
        </View>

        <Pressable
          style={styles.botonAlternarMapa}
          onPress={() => setMostrarMapa((prev) => !prev)}
        >
          <Ionicons
            name={mostrarMapa ? "list-outline" : "map-outline"}
            size={22}
            color="#FFFFFF"
          />
        </Pressable>
      </View>

      {/* Filtro horizontal de categorías */}
      <View style={styles.contenedorCategorias}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Pressable
            style={[
              styles.chipCategoria,
              { backgroundColor: esOscuro ? "#1E293B" : "#E5E8EC" },
              !categoriaSeleccionada && styles.chipActivo,
            ]}
            onPress={() => setCategoriaSeleccionada(undefined)}
          >
            <Text
              style={[
                styles.textoChip,
                { color: colores.texto },
                !categoriaSeleccionada && styles.textoChipActivo,
              ]}
            >
              Todos
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.chipCategoria,
              { backgroundColor: esOscuro ? "#1E293B" : "#E5E8EC" },
              soloAccesibles && { backgroundColor: "#117A65" },
            ]}
            onPress={() => setSoloAccesibles((prev) => !prev)}
          >
            <Text
              style={[
                styles.textoChip,
                { color: colores.texto },
                soloAccesibles && styles.textoChipActivo,
              ]}
            >
              ♿ Accesibles
            </Text>
          </Pressable>

          {categorias.map((cat) => {
            const activo = categoriaSeleccionada === cat.id;
            return (
              <Pressable
                key={cat.id}
                style={[
                  styles.chipCategoria,
                  { backgroundColor: esOscuro ? "#1E293B" : "#E5E8EC" },
                  activo && { backgroundColor: cat.color },
                ]}
                onPress={() => setCategoriaSeleccionada(cat.id)}
              >
                <Text
                  style={[
                    styles.textoChip,
                    { color: colores.texto },
                    activo && styles.textoChipActivo,
                  ]}
                >
                  {cat.nombre}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {cargando ? (
        <ActivityIndicator
          size="large"
          color={colores.primario}
          style={styles.centrado}
        />
      ) : error ? (
        <View style={styles.centrado}>
          <Text style={styles.textoError}>{error}</Text>
          <Pressable
            style={styles.botonReintentar}
            onPress={() => setRecargaTick((t) => t + 1)}
          >
            <Text style={styles.textoBoton}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={lugares}
          keyExtractor={(item) => item.id}
          scrollEnabled={!interactuandoMapa}
          ListHeaderComponent={
            <View>
              {mostrarMapa && (
                <MapaLugares
                  lugares={lugares}
                  ubicacionUsuario={ubicacionUsuario}
                  alSeleccionarLugar={(id) => router.push(`/lugares/${id}`)}
                  alInteractuarMapa={setInteractuandoMapa}
                  alSolicitarUbicacionGps={solicitarUbicacionGps}
                />
              )}

              {permisoUbicacionDenegado && !simularEnColon && (
                <View
                  style={[
                    styles.avisoSinUbicacion,
                    esOscuro && {
                      backgroundColor: "#422006",
                      borderColor: "#854D0E",
                    },
                  ]}
                >
                  <Ionicons
                    name="location-outline"
                    size={18}
                    color={esOscuro ? "#FDE047" : "#7D6608"}
                  />
                  <Text
                    style={[
                      styles.textoAvisoUbicacion,
                      esOscuro && { color: "#FEF08A" },
                    ]}
                  >
                    Ubicación desactivada: activá el GPS o usá la simulación en
                    Colón para ordenar por cercanía.
                  </Text>
                  <Pressable
                    style={styles.botonReintentarUbicacion}
                    onPress={() => void solicitarUbicacionGps()}
                  >
                    <Ionicons name="locate" size={14} color="#FFFFFF" />
                    <Text style={styles.textoBotonReintentar}>Activar GPS</Text>
                  </Pressable>
                </View>
              )}

              {/* Bloque "Cerca tuyo" del boceto de la página 3 */}
              {lugaresCerca.length > 0 && (
                <View
                  style={[
                    styles.bloqueCerca,
                    {
                      backgroundColor: colores.tarjeta,
                      borderColor: colores.borde,
                    },
                  ]}
                >
                  <View style={styles.encabezadoCerca}>
                    <Text
                      style={[styles.tituloSeccion, { color: colores.texto }]}
                    >
                      {ubicacionUsuario ? "Cerca tuyo" : "Destacados en Colón"}
                    </Text>
                    {ubicacionUsuario && (
                      <Pressable
                        onPress={() =>
                          setOrdenarPorDistancia((prev) => !prev)
                        }
                      >
                        <Text
                          style={[
                            styles.linkOrden,
                            { color: colores.primario },
                          ]}
                        >
                          {ordenarPorDistancia
                            ? "Ordenado por cercanía"
                            : "Ordenar por cercanía"}
                        </Text>
                      </Pressable>
                    )}
                  </View>

                  {lugaresCerca.map((lug) => {
                    const dist = ubicacionUsuario
                      ? formatearDistancia(
                          calcularDistanciaMetros(
                            ubicacionUsuario,
                            lug.coordenadas,
                          ),
                        )
                      : "Ver detalle";
                    return (
                      <Pressable
                        key={`cerca-${lug.id}`}
                        style={[
                          styles.itemCerca,
                          { borderBottomColor: colores.borde },
                        ]}
                        onPress={() => router.push(`/lugares/${lug.id}`)}
                      >
                        <Text
                          style={[
                            styles.nombreItemCerca,
                            { color: colores.texto },
                          ]}
                        >
                          • {lug.nombre}
                        </Text>
                        <Text
                          style={[
                            styles.distanciaItemCerca,
                            { color: colores.primario },
                          ]}
                        >
                          {dist}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <Text style={[styles.tituloSeccion, { color: colores.texto }]}>
                Todos los lugares ({lugares.length})
              </Text>
            </View>
          }
          ListEmptyComponent={
            <Text
              style={[styles.textoVacio, { color: colores.textoSecundario }]}
            >
              No se encontraron lugares con ese filtro.
            </Text>
          }
          renderItem={({ item }) => {
            const cat = categorias.find((c) => c.id === item.categoriaId);
            const distancia = ubicacionUsuario
              ? formatearDistancia(
                  calcularDistanciaMetros(ubicacionUsuario, item.coordenadas),
                )
              : null;

            return (
              <Pressable
                style={[
                  styles.tarjeta,
                  {
                    backgroundColor: colores.tarjeta,
                    borderColor: colores.borde,
                  },
                ]}
                onPress={() => router.push(`/lugares/${item.id}`)}
              >
                <View style={styles.filaEncabezadoTarjeta}>
                  {cat && (
                    <View
                      style={[
                        styles.etiquetaCategoria,
                        { backgroundColor: cat.color },
                      ]}
                    >
                      <Text style={styles.textoEtiquetaCategoria}>
                        {cat.nombre}
                      </Text>
                    </View>
                  )}
                  {distancia && (
                    <Text
                      style={[
                        styles.distanciaTarjeta,
                        { color: colores.primario },
                      ]}
                    >
                      {distancia}
                    </Text>
                  )}
                </View>

                <Text style={[styles.tituloLugar, { color: colores.texto }]}>
                  {item.nombre}
                </Text>
                <Text
                  style={[
                    styles.descripcionLugar,
                    { color: colores.textoSecundario },
                  ]}
                >
                  {item.descripcionCorta}
                </Text>

                <View style={styles.filaPieTarjeta}>
                  <Text
                    style={[
                      styles.direccionLugar,
                      { color: colores.textoSecundario },
                    ]}
                  >
                    📍 {item.direccion}
                  </Text>
                  {item.audioguia && (
                    <Text style={styles.badgeAudioguia}>🎧 Audioguía</Text>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: "#F4F6F8",
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  filaBadgesEstado: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  filaSuperior: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  badgeEstadoApi: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  puntoEstadoApi: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  textoEstadoApi: {
    fontSize: 11,
    fontWeight: "700",
  },
  badgeGps: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  textoBadgeGps: {
    fontSize: 11,
    fontWeight: "700",
  },
  cajaBuscador: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#CFD8DC",
    height: 48,
    gap: 8,
  },
  buscador: {
    flex: 1,
    fontSize: 16,
    color: "#1B2631",
  },
  botonAlternarMapa: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#1B4F72",
    justifyContent: "center",
    alignItems: "center",
  },
  contenedorCategorias: {
    marginBottom: 10,
  },
  chipCategoria: {
    backgroundColor: "#E5E8EC",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    marginRight: 8,
  },
  chipActivo: {
    backgroundColor: "#1B4F72",
  },
  textoChip: {
    fontSize: 15,
    color: "#2C3E50",
    fontWeight: "700",
  },
  textoChipActivo: {
    color: "#FFFFFF",
  },
  bloqueCerca: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#D6EAF8",
  },
  encabezadoCerca: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  tituloSeccion: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1B2631",
    marginBottom: 8,
  },
  linkOrden: {
    fontSize: 13,
    color: "#1B4F72",
    fontWeight: "700",
  },
  itemCerca: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F2F4F4",
  },
  nombreItemCerca: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1B2631",
  },
  distanciaItemCerca: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1B4F72",
  },
  centrado: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  textoError: {
    color: "#C0392B",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 12,
  },
  botonReintentar: {
    backgroundColor: "#1B4F72",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  textoBoton: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
  avisoSinUbicacion: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF9E7",
    borderColor: "#F7DC6F",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    gap: 8,
  },
  botonReintentarUbicacion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 8,
    backgroundColor: "#1B4F72",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  textoBotonReintentar: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  textoAvisoUbicacion: {
    flex: 1,
    fontSize: 13,
    color: "#7D6608",
    fontWeight: "600",
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
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#DCE1E7",
  },
  filaEncabezadoTarjeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  etiquetaCategoria: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  textoEtiquetaCategoria: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  distanciaTarjeta: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1B4F72",
  },
  tituloLugar: {
    fontSize: 19,
    fontWeight: "800",
    color: "#1B2631",
    marginBottom: 4,
  },
  descripcionLugar: {
    fontSize: 15,
    color: "#34495E",
    marginBottom: 8,
    lineHeight: 21,
  },
  filaPieTarjeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  direccionLugar: {
    fontSize: 13,
    color: "#5D6D7E",
    flex: 1,
  },
  badgeAudioguia: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6C3483",
    backgroundColor: "#F5EEF8",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
});
