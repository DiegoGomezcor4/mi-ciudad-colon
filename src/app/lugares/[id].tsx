import { Ionicons } from "@react-native-vector-icons/ionicons";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as Location from "expo-location";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Magnetometer } from "expo-sensors";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  descargarAudioguiaLocal,
  obtenerUriAudioguiaLocal,
} from "../../servicios/archivos";
import MapaLugares from "../../componentes/MapaLugares";
import {
  calcularDistanciaMetros,
  calcularRumboGrados,
  formatearDistancia,
  obtenerCategorias,
  obtenerLugarPorId,
} from "../../servicios/lugares";
import {
  obtenerSimularGpsColonSincrono,
  suscribirSimularGpsColon,
  UBICACION_DEMO_COLON,
} from "../../servicios/preferencias";
import {
  cambiarEstadoFavorito,
  consultarSiEsFavorito,
} from "../../servicios/usuario";
import { useTema } from "../../servicios/tema";
import { Categoria, Coordenadas, Horario, Lugar } from "../../tipos";

function calcularEstadoHorario(horarios: Horario[]): {
  abierto: boolean;
  texto: string;
} {
  if (!horarios || horarios.length === 0) {
    return { abierto: false, texto: "Sin horario informado" };
  }

  const ahora = new Date();
  const diaHoy = ahora.getDay() as Horario["dia"];
  const diaAyer = ((diaHoy + 6) % 7) as Horario["dia"];
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();

  // 1. Verificar si un turno nocturno que empezó ayer (ej. 20:30 a 01:00) sigue abierto en esta madrugada
  const tramosAyer = horarios.filter((h) => h.dia === diaAyer);
  for (const tramo of tramosAyer) {
    const [hAbre, mAbre] = tramo.abre.split(":").map(Number);
    const [hCierra, mCierra] = tramo.cierra.split(":").map(Number);
    const minApertura = hAbre * 60 + mAbre;
    const minCierre = hCierra * 60 + mCierra;
    if (minCierre <= minApertura && minutosAhora < minCierre) {
      return {
        abierto: true,
        texto: `Abierto ahora · cierra ${tramo.cierra}`,
      };
    }
  }

  // 2. Verificar todos los tramos de hoy (mañana, tarde o trasnoche)
  const tramosHoy = horarios.filter((h) => h.dia === diaHoy);
  if (tramosHoy.length === 0) {
    return { abierto: false, texto: "Cerrado hoy" };
  }

  for (const tramo of tramosHoy) {
    const [hAbre, mAbre] = tramo.abre.split(":").map(Number);
    const [hCierra, mCierra] = tramo.cierra.split(":").map(Number);
    const minApertura = hAbre * 60 + mAbre;
    const minCierre = hCierra * 60 + mCierra;

    const estaAbiertoEnTramo =
      minCierre > minApertura
        ? minutosAhora >= minApertura && minutosAhora < minCierre
        : minutosAhora >= minApertura || minutosAhora < minCierre;

    if (estaAbiertoEnTramo) {
      return {
        abierto: true,
        texto: `Abierto ahora · cierra ${tramo.cierra}`,
      };
    }
  }

  const resumenTramos = tramosHoy
    .map((t) => `${t.abre} a ${t.cierra}`)
    .join(" y ");

  return {
    abierto: false,
    texto: `Cerrado ahora · hoy de ${resumenTramos}`,
  };
}

function formatearDuracion(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const min = Math.floor(s / 60);
  const seg = s % 60;
  return `${min}:${seg.toString().padStart(2, "0")}`;
}

function formatearPrecio(precio: number | null): string {
  if (precio === null) return "Entrada libre / No aplica";
  if (precio === 0) return "Entrada gratuita ($0)";
  return `Entrada: $${precio.toLocaleString("es-AR")}`;
}

const NOMBRES_DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export default function PantallaDetalleLugar() {
  const { esOscuro, colores } = useTema();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lugar, setLugar] = useState<Lugar | null>(null);
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [favorito, setFavorito] = useState(false);
  const [ubicacionGpsReal, setUbicacionGpsReal] = useState<Coordenadas | null>(
    null,
  );
  const [simularEnColon, setSimularEnColon] = useState<boolean>(() =>
    obtenerSimularGpsColonSincrono(),
  );
  const [anguloMagnetometro, setAnguloMagnetometro] = useState<number>(0);
  const [uriAudioOffline, setUriAudioOffline] = useState<string | null>(null);
  const [descargandoAudio, setDescargandoAudio] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interactuandoMapa, setInteractuandoMapa] = useState(false);

  useEffect(() => {
    return suscribirSimularGpsColon(setSimularEnColon);
  }, []);

  const ubicacion: Coordenadas | null = simularEnColon
    ? UBICACION_DEMO_COLON
    : ubicacionGpsReal;

  // Configurar expo-audio para permitir reproducción incluso con la pantalla apagada en el bolsillo (PDF pág. 3 y 5)
  const fuenteAudio =
    uriAudioOffline || (lugar?.audioguia ? lugar.audioguia.url : null);
  const player = useAudioPlayer(fuenteAudio);
  const estadoAudio = useAudioPlayerStatus(player);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;

    const cargar = async () => {
      try {
        setCargando(true);
        setError(null);
        const [resLugar, resCategorias, esFav] = await Promise.all([
          obtenerLugarPorId(id),
          obtenerCategorias(),
          consultarSiEsFavorito(id),
        ]);
        setLugar(resLugar.datos);
        setFavorito(esFav);
        setUriAudioOffline(obtenerUriAudioguiaLocal(id));
        const cat =
          resCategorias.datos.find(
            (c) => c.id === resLugar.datos.categoriaId,
          ) || null;
        setCategoria(cat);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "No se pudo cargar el lugar.",
        );
      } finally {
        setCargando(false);
      }
    };

    cargar();

    // Ubicación para calcular distancia y orientación hacia el lugar
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.granted) {
          const pos = await Location.getCurrentPositionAsync({});
          setUbicacionGpsReal({
            latitud: pos.coords.latitude,
            longitud: pos.coords.longitude,
          });
        }
      } catch {}
    })();

    // Sensor magnetómetro para orientar la flecha hacia el lugar (PDF pág. 2 y 5)
    let suscripcion: { remove: () => void } | null = null;
    if (Platform.OS !== "web") {
      try {
        Magnetometer.setUpdateInterval(400);
        suscripcion = Magnetometer.addListener((data) => {
          let angulo = Math.atan2(data.y, data.x) * (180 / Math.PI);
          angulo = (angulo + 360) % 360;
          setAnguloMagnetometro(angulo);
        });
      } catch {}
    }

    return () => {
      suscripcion?.remove();
    };
  }, [id]);

  const alternarFavorito = async () => {
    if (!lugar) return;
    try {
      const nuevoEstado = await cambiarEstadoFavorito(lugar.id);
      setFavorito(nuevoEstado);
      Haptics.selectionAsync().catch(() => {});
    } catch (err) {
      Alert.alert(
        "Cuenta requerida",
        err instanceof Error
          ? err.message
          : "Tenés que ingresar con tu cuenta para hacer esto.",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Ir a Mi Cuenta",
            onPress: () => router.push("/(tabs)/perfil"),
          },
        ],
      );
    }
  };

  const abrirComoLlegar = () => {
    if (!lugar) return;
    const { latitud, longitud } = lugar.coordenadas;
    const etiqueta = encodeURIComponent(lugar.nombre);
    const url = Platform.select({
      ios: `maps:0,0?q=${etiqueta}@${latitud},${longitud}`,
      android: `geo:0,0?q=${latitud},${longitud}(${etiqueta})`,
      default: `https://www.google.com/maps/search/?api=1&query=${latitud},${longitud}`,
    });
    if (url) {
      Linking.openURL(url).catch(() =>
        Alert.alert("Error", "No se pudo abrir la aplicación de mapas."),
      );
    }
  };

  const manejarDescargaOffline = async () => {
    if (!lugar?.audioguia) return;
    try {
      setDescargandoAudio(true);
      const uri = await descargarAudioguiaLocal(lugar.id, lugar.audioguia.url);
      setUriAudioOffline(uri);
      Alert.alert(
        "Guardada en el teléfono",
        "La audioguía quedó descargada para escucharla sin señal.",
      );
    } catch {
      Alert.alert(
        "Modo sin conexión",
        "No se pudo descargar desde el servidor ahora, se reproducirá cuando haya conexión.",
      );
    } finally {
      setDescargandoAudio(false);
    }
  };

  if (cargando) {
    return (
      <View style={[styles.centrado, { backgroundColor: colores.fondo }]}>
        <Stack.Screen options={{ title: "Cargando..." }} />
        <ActivityIndicator size="large" color={colores.acento} />
      </View>
    );
  }

  if (error || !lugar) {
    return (
      <View style={[styles.centrado, { backgroundColor: colores.fondo }]}>
        <Stack.Screen options={{ title: "Detalle" }} />
        <Text style={styles.textoError}>
          {error || "No se encontró el lugar."}
        </Text>
      </View>
    );
  }

  const estadoHorario = calcularEstadoHorario(lugar.horarios);
  const distanciaMetros = ubicacion
    ? calcularDistanciaMetros(ubicacion, lugar.coordenadas)
    : null;
  const rumboLugar = ubicacion
    ? calcularRumboGrados(ubicacion, lugar.coordenadas)
    : 0;
  const rotacionFlecha = Math.round(
    (rumboLugar - anguloMagnetometro + 360) % 360,
  );

  const duracionTotal =
    estadoAudio.duration > 0
      ? estadoAudio.duration
      : lugar.audioguia?.duracionSegundos || 0;
  const tiempoRestante = Math.max(0, duracionTotal - estadoAudio.currentTime);

  return (
    <ScrollView
      style={[styles.contenedor, { backgroundColor: colores.fondo }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      scrollEnabled={!interactuandoMapa}
    >
      <Stack.Screen
        options={{
          title: lugar.nombre,
          headerRight: () => (
            <Pressable
              onPress={alternarFavorito}
              style={styles.botonFavoritoHeader}
            >
              <Ionicons
                name={favorito ? "star" : "star-outline"}
                size={26}
                color="#F39C12"
              />
            </Pressable>
          ),
        }}
      />

      {/* Fotografía */}
      {lugar.imagenes.length > 0 ? (
        <Image
          source={{ uri: lugar.imagenes[0] }}
          style={styles.imagen}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.imagen, styles.imagenPlaceholder]}>
          <Text style={styles.textoPlaceholder}>Sin fotografía disponible</Text>
        </View>
      )}

      <View style={styles.cuerpo}>
        {/* Categoría y accesibilidad */}
        <View style={styles.filaEtiquetas}>
          {categoria && (
            <View
              style={[
                styles.badgeCategoria,
                { backgroundColor: categoria.color },
              ]}
            >
              <Text style={styles.textoBadgeCategoria}>{categoria.nombre}</Text>
            </View>
          )}
          {lugar.accesible && (
            <View
              style={[
                styles.badgeAccesible,
                esOscuro && {
                  backgroundColor: "#064E3B",
                  borderColor: "#10B981",
                },
              ]}
            >
              <Text
                style={[
                  styles.textoBadgeAccesible,
                  esOscuro && { color: "#A7F3D0" },
                ]}
              >
                ♿ Accesible silla de ruedas
              </Text>
            </View>
          )}
        </View>

        <Text style={[styles.titulo, { color: colores.textoPrimario }]}>
          {lugar.nombre}
        </Text>

        {/* Estado horario abierto/cerrado */}
        <Text
          style={[
            styles.estadoHorario,
            estadoHorario.abierto ? styles.abierto : styles.cerrado,
          ]}
        >
          {estadoHorario.texto}
        </Text>

        {/* Distancia + Flecha con magnetómetro hacia el lugar (PDF pág. 2 y 4) */}
        {distanciaMetros !== null && (
          <View
            style={[
              styles.cajaBrujula,
              {
                backgroundColor: colores.superficieSecundaria,
                borderColor: colores.borde,
              },
            ]}
          >
            <View
              style={[
                styles.circuloFlecha,
                { transform: [{ rotate: `${rotacionFlecha}deg` }] },
              ]}
            >
              <Ionicons name="arrow-up" size={24} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.textoDistancia, { color: colores.acento }]}>
                A {formatearDistancia(distanciaMetros)} de donde estás
              </Text>
              <Text
                style={[
                  styles.subtextoBrujula,
                  { color: colores.textoSecundario },
                ]}
              >
                La flecha apunta en dirección a {lugar.nombre}
              </Text>
            </View>
          </View>
        )}

        {/* Datos de contacto y precio */}
        <Text style={[styles.datoSecundario, { color: colores.textoSecundario }]}>
          📍 {lugar.direccion}
        </Text>
        <Text style={[styles.datoSecundario, { color: colores.textoSecundario }]}>
          🎟️ {formatearPrecio(lugar.precioEntrada)}
        </Text>

        {/* Mapa interactivo de ubicación del lugar */}
        <View style={{ marginTop: 10 }}>
          <MapaLugares
            lugares={[lugar]}
            ubicacionUsuario={ubicacion}
            alSeleccionarLugar={() => abrirComoLlegar()}
            altura={190}
            zoomInicial={15}
            centroInicial={lugar.coordenadas}
            modoCompacto
            alInteractuarMapa={setInteractuandoMapa}
          />
        </View>

        {lugar.telefono && (
          <Pressable
            onPress={() => Linking.openURL(`tel:${lugar.telefono}`).catch(() => {})}
          >
            <Text style={[styles.datoSecundario, styles.enlace, { color: colores.acento }]}>
              📞 Llamar: {lugar.telefono}
            </Text>
          </Pressable>
        )}

        {lugar.sitioWeb && (
          <Pressable
            onPress={() => Linking.openURL(lugar.sitioWeb!).catch(() => {})}
          >
            <Text style={[styles.datoSecundario, styles.enlace, { color: colores.acento }]}>
              🌐 Sitio web: {lugar.sitioWeb}
            </Text>
          </Pressable>
        )}

        {/* Descripción completa */}
        <Text style={[styles.descripcion, { color: colores.textoPrimario }]}>
          {lugar.descripcion}
        </Text>

        {/* Horarios por día de la semana */}
        {lugar.horarios.length > 0 && (
          <View
            style={[
              styles.cajaHorarios,
              {
                backgroundColor: colores.tarjeta,
                borderColor: colores.borde,
              },
            ]}
          >
            <Text
              style={[styles.subtituloSeccion, { color: colores.textoPrimario }]}
            >
              Horarios de atención
            </Text>
            {lugar.horarios.map((h, idx) => (
              <Text
                key={idx}
                style={[styles.itemHorario, { color: colores.textoSecundario }]}
              >
                • {NOMBRES_DIAS[h.dia]}: {h.abre} a {h.cierra} hs
              </Text>
            ))}
          </View>
        )}

        {/* Reproductor de Audioguía (pausa, adelantar, cuánto falta y descarga offline) */}
        {lugar.audioguia && (
          <View
            style={[
              styles.cajaAudioguia,
              esOscuro && {
                backgroundColor: "#2E1065",
                borderColor: "#7E22CE",
              },
            ]}
          >
            <View style={styles.encabezadoAudio}>
              <Ionicons
                name="headset-outline"
                size={22}
                color={esOscuro ? "#E9D5FF" : "#6C3483"}
              />
              <Text
                style={[
                  styles.tituloAudio,
                  esOscuro && { color: "#F3E8FF" },
                ]}
              >
                Audioguía histórica ({lugar.audioguia.idioma.toUpperCase()})
              </Text>
            </View>

            <Text
              style={[
                styles.tiempoAudio,
                esOscuro && { color: "#D8B4FE" },
              ]}
            >
              Transcurrido: {formatearDuracion(estadoAudio.currentTime)} ·
              Faltan: {formatearDuracion(tiempoRestante)}
            </Text>

            <View style={styles.controlesAudio}>
              <Pressable
                style={[
                  styles.botonControlAudio,
                  esOscuro && {
                    backgroundColor: "#1E1B4B",
                    borderColor: "#A855F7",
                  },
                ]}
                onPress={() =>
                  player.seekTo(Math.max(0, estadoAudio.currentTime - 15))
                }
              >
                <Text
                  style={[
                    styles.textoControlAudio,
                    esOscuro && { color: "#E9D5FF" },
                  ]}
                >
                  -15s
                </Text>
              </Pressable>

              <Pressable
                style={[styles.botonControlAudio, styles.botonPlayAudio]}
                onPress={() => {
                  if (estadoAudio.playing) {
                    player.pause();
                  } else {
                    player.play();
                  }
                }}
              >
                <Text style={styles.textoPlayAudio}>
                  {estadoAudio.playing ? "⏸ Pausar" : "▶ Escuchar"}
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.botonControlAudio,
                  esOscuro && {
                    backgroundColor: "#1E1B4B",
                    borderColor: "#A855F7",
                  },
                ]}
                onPress={() =>
                  player.seekTo(
                    Math.min(duracionTotal, estadoAudio.currentTime + 15),
                  )
                }
              >
                <Text
                  style={[
                    styles.textoControlAudio,
                    esOscuro && { color: "#E9D5FF" },
                  ]}
                >
                  +15s
                </Text>
              </Pressable>
            </View>

            <Pressable
              style={styles.botonDescargaAudio}
              onPress={manejarDescargaOffline}
              disabled={descargandoAudio || Boolean(uriAudioOffline)}
            >
              <Text
                style={[
                  styles.textoDescargaAudio,
                  esOscuro && { color: "#E9D5FF" },
                ]}
              >
                {uriAudioOffline
                  ? "✓ Guardada en el teléfono (disponible sin señal)"
                  : descargandoAudio
                    ? "Descargando audioguía..."
                    : "⬇ Guardar en el teléfono para usar sin señal"}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Botones principales del boceto de la página 4 */}
        <View style={styles.contenedorBotones}>
          <Pressable
            style={[styles.botonAccion, styles.botonMapa]}
            onPress={abrirComoLlegar}
          >
            <Ionicons name="navigate-outline" size={20} color="#FFFFFF" />
            <Text style={styles.textoBotonAccion}>Cómo llegar</Text>
          </Pressable>

          <Pressable
            style={[styles.botonAccion, styles.botonVisita]}
            onPress={() =>
              router.push({
                pathname: "/visitas/nueva",
                params: { lugarId: lugar.id },
              })
            }
          >
            <Ionicons name="camera-outline" size={20} color="#FFFFFF" />
            <Text style={styles.textoBotonAccion}>Registrar visita</Text>
          </Pressable>
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
    padding: 20,
    backgroundColor: "#F4F6F8",
  },
  textoError: {
    color: "#C0392B",
    fontSize: 16,
    textAlign: "center",
  },
  botonFavoritoHeader: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  imagen: {
    width: "100%",
    height: 220,
    backgroundColor: "#DCE1E7",
  },
  imagenPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  textoPlaceholder: {
    color: "#5D6D7E",
    fontSize: 15,
  },
  cuerpo: {
    padding: 18,
  },
  filaEtiquetas: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  badgeCategoria: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  textoBadgeCategoria: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  badgeAccesible: {
    backgroundColor: "#E8F8F5",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#16A085",
  },
  textoBadgeAccesible: {
    color: "#117A65",
    fontSize: 13,
    fontWeight: "700",
  },
  titulo: {
    fontSize: 25,
    fontWeight: "800",
    color: "#1B2631",
    marginBottom: 6,
  },
  estadoHorario: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  abierto: {
    color: "#1E8449",
  },
  cerrado: {
    color: "#C0392B",
  },
  cajaBrujula: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EBF5FB",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#AED6F1",
    gap: 12,
  },
  circuloFlecha: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#1B4F72",
    justifyContent: "center",
    alignItems: "center",
  },
  textoDistancia: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1B4F72",
  },
  subtextoBrujula: {
    fontSize: 13,
    color: "#34495E",
    marginTop: 2,
  },
  datoSecundario: {
    fontSize: 15,
    color: "#2C3E50",
    marginBottom: 6,
  },
  enlace: {
    color: "#1B4F72",
    fontWeight: "700",
  },
  descripcion: {
    fontSize: 16,
    lineHeight: 24,
    color: "#1B2631",
    marginTop: 12,
    marginBottom: 18,
  },
  cajaHorarios: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#DCE1E7",
  },
  subtituloSeccion: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1B2631",
    marginBottom: 6,
  },
  itemHorario: {
    fontSize: 14,
    color: "#34495E",
    marginBottom: 3,
  },
  cajaAudioguia: {
    backgroundColor: "#F5EEF8",
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#D7BDE2",
  },
  encabezadoAudio: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  tituloAudio: {
    fontSize: 17,
    fontWeight: "800",
    color: "#4A235A",
  },
  tiempoAudio: {
    fontSize: 14,
    color: "#6C3483",
    fontWeight: "600",
    marginBottom: 12,
  },
  controlesAudio: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  botonControlAudio: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#8E44AD",
    justifyContent: "center",
    alignItems: "center",
  },
  botonPlayAudio: {
    flex: 1,
    backgroundColor: "#8E44AD",
  },
  textoControlAudio: {
    color: "#6C3483",
    fontWeight: "700",
    fontSize: 14,
  },
  textoPlayAudio: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 16,
  },
  botonDescargaAudio: {
    paddingVertical: 8,
    alignItems: "center",
  },
  textoDescargaAudio: {
    fontSize: 13,
    color: "#4A235A",
    fontWeight: "700",
  },
  contenedorBotones: {
    gap: 12,
    marginBottom: 20,
  },
  botonAccion: {
    flexDirection: "row",
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  botonMapa: {
    backgroundColor: "#1B4F72",
  },
  botonVisita: {
    backgroundColor: "#1E8449",
  },
  textoBotonAccion: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },
});
