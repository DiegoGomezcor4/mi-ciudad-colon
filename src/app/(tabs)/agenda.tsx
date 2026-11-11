import { Ionicons } from "@react-native-vector-icons/ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  obtenerEventos,
  obtenerMisEventosGuardadosIds,
} from "../../servicios/eventos";
import { obtenerLugares } from "../../servicios/lugares";
import { EstadoEvento, Evento, Lugar } from "../../tipos";

function formatearFechaHora(iso: string): string {
  const fecha = new Date(iso);
  return fecha.toLocaleDateString("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function estiloPorEstado(estado: EstadoEvento): {
  fondo: string;
  texto: string;
  etiqueta: string;
} {
  switch (estado) {
    case "programado":
      return { fondo: "#D4EFDF", texto: "#1E8449", etiqueta: "Programado" };
    case "suspendido":
      return {
        fondo: "#FCF3CF",
        texto: "#B7950B",
        etiqueta: "Suspendido por lluvia",
      };
    case "cancelado":
      return { fondo: "#FADBD8", texto: "#C0392B", etiqueta: "Cancelado" };
    case "finalizado":
      return { fondo: "#E5E8EC", texto: "#5D6D7E", etiqueta: "Finalizado" };
  }
}

export default function PantallaAgenda() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [guardadosIds, setGuardadosIds] = useState<string[]>([]);
  const [soloGuardados, setSoloGuardados] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargarAgenda = useCallback(async () => {
    try {
      setCargando(true);
      const [resEventos, resLugares, idsGuardados] = await Promise.all([
        obtenerEventos(),
        obtenerLugares(),
        obtenerMisEventosGuardadosIds(),
      ]);
      setEventos(resEventos.datos);
      setLugares(resLugares.datos);
      setGuardadosIds(idsGuardados);
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargarAgenda();
    }, [cargarAgenda]),
  );

  const eventosMostrados = soloGuardados
    ? eventos.filter((e) => guardadosIds.includes(e.id))
    : eventos;

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator size="large" color="#1B4F72" />
      </View>
    );
  }

  return (
    <View style={styles.contenedor}>
      <View style={styles.barraFiltros}>
        <Pressable
          style={[styles.botonFiltro, !soloGuardados && styles.filtroActivo]}
          onPress={() => setSoloGuardados(false)}
        >
          <Text
            style={[
              styles.textoFiltro,
              !soloGuardados && styles.textoFiltroActivo,
            ]}
          >
            Todos los eventos ({eventos.length})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.botonFiltro, soloGuardados && styles.filtroActivo]}
          onPress={() => setSoloGuardados(true)}
        >
          <Text
            style={[
              styles.textoFiltro,
              soloGuardados && styles.textoFiltroActivo,
            ]}
          >
            Guardados ({guardadosIds.length})
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={eventosMostrados}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={styles.textoVacio}>
            No hay eventos guardados todavía.
          </Text>
        }
        renderItem={({ item }) => {
          const estadoBadge = estiloPorEstado(item.estado);
          const lugarCatalogo = item.lugarId
            ? lugares.find((l) => l.id === item.lugarId)
            : null;
          const ubicacionTexto = lugarCatalogo
            ? lugarCatalogo.nombre
            : item.direccionLibre || "Colón, Entre Ríos";
          const estaGuardado = guardadosIds.includes(item.id);
          const precioTexto =
            item.precio === 0
              ? "Gratis"
              : item.precio === null
                ? "Libre"
                : `$${item.precio.toLocaleString("es-AR")}`;

          return (
            <Pressable
              style={styles.tarjeta}
              onPress={() => router.push(`/eventos/${item.id}`)}
            >
              <View style={styles.filaSuperior}>
                <View
                  style={[
                    styles.badgeEstado,
                    { backgroundColor: estadoBadge.fondo },
                  ]}
                >
                  <Text
                    style={[
                      styles.textoBadgeEstado,
                      { color: estadoBadge.texto },
                    ]}
                  >
                    {estadoBadge.etiqueta}
                  </Text>
                </View>

                <View style={styles.filaDerecha}>
                  <Text style={styles.precio}>{precioTexto}</Text>
                  {estaGuardado && (
                    <Ionicons name="notifications" size={18} color="#1B4F72" />
                  )}
                </View>
              </View>

              <Text style={styles.titulo}>{item.titulo}</Text>
              <Text style={styles.fecha}>
                🗓️ {formatearFechaHora(item.inicio)}
              </Text>
              <Text style={styles.ubicacion}>📍 {ubicacionTexto}</Text>
              <Text style={styles.descripcion} numberOfLines={2}>
                {item.descripcion}
              </Text>
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
  barraFiltros: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  botonFiltro: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#E5E8EC",
    alignItems: "center",
  },
  filtroActivo: {
    backgroundColor: "#1B4F72",
  },
  textoFiltro: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2C3E50",
  },
  textoFiltroActivo: {
    color: "#FFFFFF",
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
  filaSuperior: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  badgeEstado: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  textoBadgeEstado: {
    fontSize: 12,
    fontWeight: "800",
  },
  filaDerecha: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  precio: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1E8449",
  },
  titulo: {
    fontSize: 19,
    fontWeight: "800",
    color: "#1B2631",
    marginBottom: 6,
  },
  fecha: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1B4F72",
    marginBottom: 4,
  },
  ubicacion: {
    fontSize: 14,
    color: "#34495E",
    fontWeight: "600",
    marginBottom: 6,
  },
  descripcion: {
    fontSize: 15,
    color: "#4D5656",
    lineHeight: 21,
  },
});
