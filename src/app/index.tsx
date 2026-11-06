import { useEffect, useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from "react-native";
import { obtenerCategorias, obtenerLugares } from "../servicios/lugares";
import { Categoria, Lugar } from "../tipos";

export default function PantallaLugares() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<
    string | undefined
  >(undefined);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cargar las categorias una sola vez al abrir la Pantalla
  useEffect(() => {
    obtenerCategorias()
      .then((res) => setCategorias(res.datos))
      .catch(() => {});
  }, []);

  // Funcion que pide los lugares a la API segun el filtro actual
  const cargarLugares = async () => {
    try {
      setCargando(true);
      setError(null);
      const respuesta = await obtenerLugares({
        categoriaId: categoriaSeleccionada,
        q: busqueda.trim() || undefined,
      });
      setLugares(respuesta.datos);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.menssaje
          : "No se pudieron cargar los lugares.",
      );
    } finally {
      setCargando(false);
    }
  };

  // Recargar lugares cada vez que cambia la categoria o el texto buscado
  useEffect(() => {
    cargarLugares();
  }, [categoriaSeleccionada, busqueda]);

  return (
    <View style={styles.contenedor}>
      {/* Buscador por nombre */}
      <TextInput
        style={styles.buscador}
        placeholder="Buscar lugar en colon (ej: Molino, termas)..."
        value={busqueda}
        onChageText={setBusqueda}
      />

      {/* Filtro horizontal de categorias*/}
      <View style={styles.contenedorCategorias}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Pressable
            style={[
              styles.chipCategoria,
              !categoriaSeleccionada && StyleSheet.chipActivo,
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
        </ScrollView>
      </View>
    </View>
  );
}
