import { Ionicons } from "@react-native-vector-icons/ionicons";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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
  calcularDistanciaMetros,
  formatearDistancia,
  obtenerCategorias,
  obtenerLugares,
} from "../../servicios/lugares";
import { verificarYNotificarProximidad } from "../../servicios/notificaciones";
import { Categoria, Coordenadas, Lugar } from "../../tipos";

export default function PantallaMapaYLugares() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<
    string | undefined
  >(undefined);
  const [busqueda, setBusqueda] = useState("");
  const [ordenarPorDistancia, setOrdenarPorDistancia] = useState(true);
  const [mostrarMapa, setMostrarMapa] = useState(true);
  const [ubicacionUsuario, setUbicacionUsuario] = useState<Coordenadas | null>(
    null,
  );
  const [permisoUbicacionDenegado, setPermisoUbicacionDenegado] =
    useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Cargar categorías y pedir ubicación (si el usuario la niega, la app sigue funcionando)
  useEffect(() => {
    obtenerCategorias()
      .then((res) => setCategorias(res.datos))
      .catch(() => {});

    (async () => {
      try {
        const permiso = await Location.requestForegroundPermissionsAsync();
        if (permiso.status !== "granted") {
          setPermisoUbicacionDenegado(true);
          return;
        }
        const posicion = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUbicacionUsuario({
          latitud: posicion.coords.latitude,
          longitud: posicion.coords.longitude,
        });
      } catch {
        setPermisoUbicacionDenegado(true);
      }
    })();
  }, []);

  // 2. Cargar lugares según filtros
  const cargarLugares = async () => {
    try {
      setCargando(true);
      setError(null);
      const respuesta = await obtenerLugares({
        categoriaId: categoriaSeleccionada,
        q: busqueda.trim() || undefined,
        latitud: ubicacionUsuario?.latitud,
        longitud: ubicacionUsuario?.longitud,
        orden:
          ordenarPorDistancia && ubicacionUsuario ? "distancia" : "nombre",
      });
      setLugares(respuesta.datos);

      // Verificar si hay algún lugar dentro del radio para avisar (máx 1 vez por lugar y por día)
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
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los lugares.",
      );
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarLugares();
  }, [categoriaSeleccionada, busqueda, ubicacionUsuario, ordenarPorDistancia]);

  // Lista "Cerca tuyo" ordenada por distancia (boceto página 3 del PDF)
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

  return (
    <View style={styles.contenedor}>
      {/* Buscador y botón para mostrar/ocultar mapa */}
      <View style={styles.filaSuperior}>
        <View style={styles.cajaBuscador}>
          <Ionicons name="search-outline" size={20} color="#5D6D7E" />
          <TextInput
            style={styles.buscador}
            placeholder="Buscar lugar en Colón (ej: Molino, termas)..."
            placeholderTextColor="#7F8C8D"
            value={busqueda}
            onChangeText={setBusqueda}
          />
          {busqueda.length > 0 && (
            <Pressable onPress={() => setBusqueda("")}>
              <Ionicons name="close-circle" size={20} color="#7F8C8D" />
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
              !categoriaSeleccionada && styles.chipActivo,
            ]}
            onPress={() => setCategoriaSeleccionada(undefined)}
          >
            <Text
              style={[
                styles.textoChip,
                !categoriaSeleccionada && styles.textoChipActivo,
              ]}
            >
              Todos
            </Text>
          </Pressable>

          {categorias.map((cat) => {
            const activo = categoriaSeleccionada === cat.id;
            return (
              <Pressable
                key={cat.id}
                style={[
                  styles.chipCategoria,
                  activo && { backgroundColor: cat.color },
                ]}
                onPress={() => setCategoriaSeleccionada(cat.id)}
              >
                <Text
                  style={[styles.textoChip, activo && styles.textoChipActivo]}
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
          color="#1B4F72"
          style={styles.centrado}
        />
      ) : error ? (
        <View style={styles.centrado}>
          <Text style={styles.textoError}>{error}</Text>
          <Pressable style={styles.botonReintentar} onPress={cargarLugares}>
            <Text style={styles.textoBoton}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={lugares}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View>
              {mostrarMapa && (
                <MapaLugares
                  lugares={lugares}
                  ubicacionUsuario={ubicacionUsuario}
                  alSeleccionarLugar={(id) => router.push(`/lugares/${id}`)}
                />
              )}

              {permisoUbicacionDenegado && (
                <View style={styles.avisoSinUbicacion}>
                  <Ionicons
                    name="location-outline"
                    size={18}
                    color="#7D6608"
                  />
                  <Text style={styles.textoAvisoUbicacion}>
                    Ubicación desactivada: podés ver el mapa y el catálogo
                    completo igual.
                  </Text>
                </View>
              )}

              {/* Bloque "Cerca tuyo" del boceto de la página 3 */}
              {lugaresCerca.length > 0 && (
                <View style={styles.bloqueCerca}>
                  <View style={styles.encabezadoCerca}>
                    <Text style={styles.tituloSeccion}>
                      {ubicacionUsuario ? "Cerca tuyo" : "Destacados en Colón"}
                    </Text>
                    {ubicacionUsuario && (
                      <Pressable
                        onPress={() =>
                          setOrdenarPorDistancia((prev) => !prev)
                        }
                      >
                        <Text style={styles.linkOrden}>
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
                        style={styles.itemCerca}
                        onPress={() => router.push(`/lugares/${lug.id}`)}
                      >
                        <Text style={styles.nombreItemCerca}>
                          • {lug.nombre}
                        </Text>
                        <Text style={styles.distanciaItemCerca}>{dist}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <Text style={styles.tituloSeccion}>
                Todos los lugares ({lugares.length})
              </Text>
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.textoVacio}>
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
                style={styles.tarjeta}
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
                    <Text style={styles.distanciaTarjeta}>{distancia}</Text>
                  )}
                </View>

                <Text style={styles.tituloLugar}>{item.nombre}</Text>
                <Text style={styles.descripcionLugar}>
                  {item.descripcionCorta}
                </Text>

                <View style={styles.filaPieTarjeta}>
                  <Text style={styles.direccionLugar}>📍 {item.direccion}</Text>
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
    paddingTop: 12,
  },
  filaSuperior: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
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
  textoAvisoUbicacion: {
    flex: 1,
    fontSize: 13,
    color: "#7D6608",
    fontWeight: "600",
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
