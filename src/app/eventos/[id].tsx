import { Ionicons } from "@react-native-vector-icons/ionicons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  alternarGuardarEvento,
  cambiarEstadoEventoApi,
  obtenerEventoPorId,
  obtenerMisEventosGuardadosIds,
} from "../../servicios/eventos";
import { obtenerLugarPorId } from "../../servicios/lugares";
import { programarRecordatorioEvento } from "../../servicios/notificaciones";
import { useTema } from "../../servicios/tema";
import { Evento, Lugar } from "../../tipos";

function calcularDuracionTexto(inicioIso: string, finIso: string | null): string {
  if (!finIso) return "Duración abierta";
  const ms = new Date(finIso).getTime() - new Date(inicioIso).getTime();
  if (ms <= 0) return "Duración abierta";
  const horas = Math.round((ms / 3600000) * 10) / 10;
  return `${horas} hs aprox.`;
}

export default function PantallaDetalleEvento() {
  const { esOscuro, colores } = useTema();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [evento, setEvento] = useState<Evento | null>(null);
  const [lugarAsociado, setLugarAsociado] = useState<Lugar | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!id) return;

    (async () => {
      try {
        setCargando(true);
        const [resEvento, idsGuardados] = await Promise.all([
          obtenerEventoPorId(id),
          obtenerMisEventosGuardadosIds(),
        ]);
        setEvento(resEvento.datos);
        setGuardado(idsGuardados.includes(id));

        if (resEvento.datos.lugarId) {
          try {
            const resLugar = await obtenerLugarPorId(resEvento.datos.lugarId);
            setLugarAsociado(resLugar.datos);
          } catch {}
        }
      } finally {
        setCargando(false);
      }
    })();
  }, [id]);

  const manejarGuardarRecordatorio = async () => {
    if (!evento) return;
    try {
      const nuevoEstado = await alternarGuardarEvento(evento.id);
      setGuardado(nuevoEstado);

      if (nuevoEstado) {
        const notificado = await programarRecordatorioEvento(evento);
        Alert.alert(
          "Evento guardado",
          notificado
            ? "Te vamos a avisar con una notificación antes de que empiece (o si se suspende por lluvia)."
            : "Evento guardado en tu agenda.",
        );
      } else {
        Alert.alert(
          "Quitado de tu agenda",
          "Ya no recibirás avisos de este evento.",
        );
      }
    } catch (err) {
      const mensaje =
        err instanceof Error
          ? err.message
          : "Tenés que ingresar con tu cuenta para hacer esto.";
      if (mensaje.toLowerCase().includes("cuenta")) {
        Alert.alert("Cuenta requerida", mensaje, [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Ir a Mi Cuenta",
            onPress: () => router.push("/(tabs)/perfil"),
          },
        ]);
      } else {
        Alert.alert("No se pudo guardar", mensaje);
      }
    }
  };

  // Permite demostrar en la defensa oral el requisito de la página 2:
  // "Marcar un evento como cancelado o suspendido por lluvia, y que quien lo guardó se entere."
  const cambiarEstadoDemo = async (
    nuevoEstado: "programado" | "suspendido" | "cancelado",
  ) => {
    if (!evento) return;
    const res = await cambiarEstadoEventoApi(evento.id, nuevoEstado);
    const actualizado: Evento = res ?? { ...evento, estado: nuevoEstado };
    setEvento(actualizado);
    if (guardado) {
      await programarRecordatorioEvento(actualizado);
    }
    Alert.alert(
      "Estado actualizado",
      guardado
        ? `El evento pasó a "${nuevoEstado}" y se envió una notificación porque lo tenías guardado.`
        : `El evento pasó a "${nuevoEstado}".`,
    );
  };

  if (cargando || !evento) {
    return (
      <View style={[styles.centrado, { backgroundColor: colores.fondo }]}>
        <ActivityIndicator size="large" color={colores.acento} />
      </View>
    );
  }

  const fechaInicio = new Date(evento.inicio).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const duracion = calcularDuracionTexto(evento.inicio, evento.fin);
  const precioTexto =
    evento.precio === 0
      ? "Gratis ($0)"
      : evento.precio === null
        ? "Entrada libre / No aplica"
        : `$${evento.precio.toLocaleString("es-AR")}`;

  return (
    <ScrollView
      style={[styles.contenedor, { backgroundColor: colores.fondo }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <Stack.Screen options={{ title: evento.titulo }} />

      <View style={styles.cuerpo}>
        <View
          style={[
            styles.badgeEstado,
            evento.estado === "suspendido"
              ? { backgroundColor: esOscuro ? "#713F12" : "#FCF3CF" }
              : evento.estado === "cancelado"
                ? { backgroundColor: esOscuro ? "#7F1D1D" : "#FADBD8" }
                : { backgroundColor: esOscuro ? "#1E3A8A" : "#D6EAF8" },
          ]}
        >
          <Text
            style={[
              styles.textoEstado,
              evento.estado === "suspendido"
                ? { color: esOscuro ? "#FEF08A" : "#B7950B" }
                : evento.estado === "cancelado"
                  ? { color: esOscuro ? "#FECACA" : "#C0392B" }
                  : { color: esOscuro ? "#BFDBFE" : "#1B4F72" },
            ]}
          >
            Estado actual: {evento.estado.toUpperCase()}
          </Text>
        </View>

        <Text style={[styles.titulo, { color: colores.textoPrimario }]}>
          {evento.titulo}
        </Text>

        <View
          style={[
            styles.cajaInfo,
            { backgroundColor: colores.tarjeta, borderColor: colores.borde },
          ]}
        >
          <Text style={[styles.dato, { color: colores.textoSecundario }]}>
            🗓️ Cuándo empieza: {fechaInicio}
          </Text>
          <Text style={[styles.dato, { color: colores.textoSecundario }]}>
            ⏱️ Cuánto dura: {duracion}
          </Text>
          <Text style={[styles.dato, { color: colores.textoSecundario }]}>
            🎟️ Precio: {precioTexto}
          </Text>
          <Text style={[styles.dato, { color: colores.textoSecundario }]}>
            📍 Dónde:{" "}
            {lugarAsociado
              ? `${lugarAsociado.nombre} (${lugarAsociado.direccion})`
              : evento.direccionLibre || "Colón, Entre Ríos"}
          </Text>
        </View>

        {lugarAsociado && (
          <Pressable
            style={[
              styles.botonIrAlLugar,
              {
                backgroundColor: colores.superficieSecundaria,
                borderColor: colores.borde,
              },
            ]}
            onPress={() => router.push(`/lugares/${lugarAsociado.id}`)}
          >
            <Ionicons name="business-outline" size={20} color={colores.acento} />
            <Text style={[styles.textoIrAlLugar, { color: colores.acento }]}>
              Ver lugar del catálogo: {lugarAsociado.nombre} →
            </Text>
          </Pressable>
        )}

        <Text style={[styles.descripcion, { color: colores.textoPrimario }]}>
          {evento.descripcion}
        </Text>

        <Pressable
          style={[
            styles.botonPrincipal,
            guardado && styles.botonGuardadoActivo,
          ]}
          onPress={manejarGuardarRecordatorio}
        >
          <Ionicons
            name={guardado ? "notifications" : "notifications-outline"}
            size={20}
            color="#FFFFFF"
          />
          <Text style={styles.textoBotonPrincipal}>
            {guardado
              ? "Evento guardado (Avisarme)"
              : "Guardar evento y avisarme antes"}
          </Text>
        </Pressable>

        {/* Panel para probar la suspensión por lluvia pedida en el PDF */}
        <View
          style={[
            styles.cajaClima,
            { backgroundColor: colores.tarjeta, borderColor: colores.borde },
          ]}
        >
          <Text style={[styles.tituloClima, { color: colores.textoSecundario }]}>
            Aviso climático / Estado del evento
          </Text>
          <View style={styles.filaBotonesClima}>
            <Pressable
              style={[
                styles.botonClima,
                {
                  backgroundColor: colores.superficieSecundaria,
                  borderColor: colores.borde,
                },
              ]}
              onPress={() => cambiarEstadoDemo("programado")}
            >
              <Text
                style={[styles.textoBotonClima, { color: colores.textoPrimario }]}
              >
                ☀️ Normal
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.botonClima,
                {
                  backgroundColor: colores.superficieSecundaria,
                  borderColor: colores.borde,
                },
              ]}
              onPress={() => cambiarEstadoDemo("suspendido")}
            >
              <Text
                style={[styles.textoBotonClima, { color: colores.textoPrimario }]}
              >
                🌧️ Lluvia
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.botonClima,
                {
                  backgroundColor: colores.superficieSecundaria,
                  borderColor: colores.borde,
                },
              ]}
              onPress={() => cambiarEstadoDemo("cancelado")}
            >
              <Text
                style={[styles.textoBotonClima, { color: colores.textoPrimario }]}
              >
                ❌ Cancelar
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: "#F4F6F8",
  },
  centrado: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  cuerpo: {
    padding: 18,
  },
  badgeEstado: {
    alignSelf: "flex-start",
    backgroundColor: "#D6EAF8",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 10,
  },
  textoEstado: {
    color: "#1B4F72",
    fontWeight: "800",
    fontSize: 13,
  },
  titulo: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1B2631",
    marginBottom: 14,
  },
  cajaInfo: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: "#DCE1E7",
    marginBottom: 14,
    gap: 8,
  },
  dato: {
    fontSize: 15,
    color: "#2C3E50",
    fontWeight: "600",
  },
  botonIrAlLugar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EBF5FB",
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#AED6F1",
    marginBottom: 16,
    gap: 8,
  },
  textoIrAlLugar: {
    color: "#1B4F72",
    fontWeight: "700",
    fontSize: 15,
  },
  descripcion: {
    fontSize: 16,
    lineHeight: 24,
    color: "#1B2631",
    marginBottom: 24,
  },
  botonPrincipal: {
    flexDirection: "row",
    backgroundColor: "#1B4F72",
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  botonGuardadoActivo: {
    backgroundColor: "#1E8449",
  },
  textoBotonPrincipal: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  cajaClima: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#DCE1E7",
  },
  tituloClima: {
    fontSize: 14,
    fontWeight: "700",
    color: "#5D6D7E",
    marginBottom: 10,
  },
  filaBotonesClima: {
    flexDirection: "row",
    gap: 10,
  },
  botonClima: {
    flex: 1,
    backgroundColor: "#F2F4F4",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#CFD8DC",
  },
  textoBotonClima: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2C3E50",
  },
});
