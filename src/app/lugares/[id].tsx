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
import {
  calcularDistanciaMetros,
  calcularRumboGrados,
  formatearDistancia,
  obtenerCategorias,
  obtenerLugarPorId,
} from "../../servicios/lugares";
import {
  cambiarEstadoFavorito,
  consultarSiEsFavorito,
} from "../../servicios/usuario";
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
  const horarioHoy = horarios.find((h) => h.dia === diaHoy);

  if (!horarioHoy) {
    return { abierto: false, texto: "Cerrado hoy" };
  }

  const [horaAbre, minAbre] = horarioHoy.abre.split(":").map(Number);
  const [horaCierra, minCierra] = horarioHoy.cierra.split(":").map(Number);

  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const minutosApertura = horaAbre * 60 + minAbre;
  const minutosCierre = horaCierra * 60 + minCierra;

  if (minutosAhora >= minutosApertura && minutosAhora < minutosCierre) {
    return {
      abierto: true,
      texto: `Abierto ahora · cierra ${horarioHoy.cierra}`,
    };
  }

  return {
    abierto: false,
    texto: `Cerrado ahora · hoy de ${horarioHoy.abre} a ${horarioHoy.cierra}`,
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lugar, setLugar] = useState<Lugar | null>(null);
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [favorito, setFavorito] = useState(false);
  const [ubicacion, setUbicacion] = useState<Coordenadas | null>(null);
  const [anguloMagnetometro, setAnguloMagnetometro] = useState<number>(0);
  const [uriAudioOffline, setUriAudioOffline] = useState<string | null>(null);
  const [descargandoAudio, setDescargandoAudio] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          setUbicacion({
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
    const nuevoEstado = await cambiarEstadoFavorito(lugar.id);
    setFavorito(nuevoEstado);
    Haptics.selectionAsync().catch(() => {});
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
      <View style={styles.centrado}>
        <Stack.Screen options={{ title: "Cargando..." }} />
        <ActivityIndicator size="large" color="#1B4F72" />
      </View>
    );
  }

  if (error || !lugar) {
    return (
      <View style={styles.centrado}>
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
    <ScrollView style={styles.contenedor}>
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
            <View style={styles.badgeAccesible}>
              <Text style={styles.textoBadgeAccesible}>
                ♿ Accesible silla de ruedas
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.titulo}>{lugar.nombre}</Text>

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
          <View style={styles.cajaBrujula}>
            <View
              style={[
                styles.circuloFlecha,
                { transform: [{ rotate: `${rotacionFlecha}deg` }] },
              ]}
            >
              <Ionicons name="arrow-up" size={24} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.textoDistancia}>
                A {formatearDistancia(distanciaMetros)} de donde estás
              </Text>
              <Text style={styles.subtextoBrujula}>
                La flecha apunta en dirección a {lugar.nombre}
              </Text>
            </View>
          </View>
        )}

        {/* Datos de contacto y precio */}
        <Text style={styles.datoSecundario}>📍 {lugar.direccion}</Text>
        <Text style={styles.datoSecundario}>
          🎟️ {formatearPrecio(lugar.precioEntrada)}
        </Text>

        {lugar.telefono && (
          <Pressable
            onPress={() => Linking.openURL(`tel:${lugar.telefono}`).catch(() => {})}
          >
            <Text style={[styles.datoSecundario, styles.enlace]}>
              📞 Llamar: {lugar.telefono}
            </Text>
          </Pressable>
        )}

        {lugar.sitioWeb && (
          <Pressable
            onPress={() => Linking.openURL(lugar.sitioWeb!).catch(() => {})}
          >
            <Text style={[styles.datoSecundario, styles.enlace]}>
              🌐 Sitio web: {lugar.sitioWeb}
            </Text>
          </Pressable>
        )}

        {/* Descripción completa */}
        <Text style={styles.descripcion}>{lugar.descripcion}</Text>

        {/* Horarios por día de la semana */}
        {lugar.horarios.length > 0 && (
          <View style={styles.cajaHorarios}>
            <Text style={styles.subtituloSeccion}>Horarios de atención</Text>
            {lugar.horarios.map((h, idx) => (
              <Text key={idx} style={styles.itemHorario}>
                • {NOMBRES_DIAS[h.dia]}: {h.abre} a {h.cierra} hs
              </Text>
            ))}
          </View>
        )}

        {/* Reproductor de Audioguía (pausa, adelantar, cuánto falta y descarga offline) */}
        {lugar.audioguia && (
          <View style={styles.cajaAudioguia}>
            <View style={styles.encabezadoAudio}>
              <Ionicons name="headset-outline" size={22} color="#6C3483" />
              <Text style={styles.tituloAudio}>
                Audioguía histórica ({lugar.audioguia.idioma.toUpperCase()})
              </Text>
            </View>

            <Text style={styles.tiempoAudio}>
              Transcurrido: {formatearDuracion(estadoAudio.currentTime)} ·
              Faltan: {formatearDuracion(tiempoRestante)}
            </Text>

            <View style={styles.controlesAudio}>
              <Pressable
                style={styles.botonControlAudio}
                onPress={() =>
                  player.seekTo(Math.max(0, estadoAudio.currentTime - 15))
                }
              >
                <Text style={styles.textoControlAudio}>-15s</Text>
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
                style={styles.botonControlAudio}
                onPress={() =>
                  player.seekTo(
                    Math.min(duracionTotal, estadoAudio.currentTime + 15),
                  )
                }
              >
                <Text style={styles.textoControlAudio}>+15s</Text>
              </Pressable>
            </View>

            <Pressable
              style={styles.botonDescargaAudio}
              onPress={manejarDescargaOffline}
              disabled={descargandoAudio || Boolean(uriAudioOffline)}
            >
              <Text style={styles.textoDescargaAudio}>
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
