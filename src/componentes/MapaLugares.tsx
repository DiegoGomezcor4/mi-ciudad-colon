import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useMemo, useRef, useState } from "react";
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  calcularDistanciaMetros,
  formatearDistancia,
} from "../servicios/lugares";
import { Coordenadas, Lugar } from "../tipos";

interface PropsMapaLugares {
  lugares: Lugar[];
  ubicacionUsuario: Coordenadas | null;
  alSeleccionarLugar: (lugarId: string) => void;
  altura?: number;
  zoomInicial?: number;
  centroInicial?: Coordenadas;
  modoCompacto?: boolean;
  alInteractuarMapa?: (activo: boolean) => void;
}

const CENTRO_CIUDAD_COLON: Coordenadas = {
  latitud: -32.222,
  longitud: -58.1405,
};

const CENTRO_COLONIA_SAN_JOSE: Coordenadas = {
  latitud: -32.203,
  longitud: -58.182,
};

const CENTRO_REGION_PALMAR: Coordenadas = {
  latitud: -32.06,
  longitud: -58.23,
};

const TAMANO_TILE = 256;
const ZOOM_MIN = 10;
const ZOOM_MAX = 17;

const HEADERS_TILE_MAPA = {
  "User-Agent": "MiCiudadColonApp/1.0 (UNER Desarrollo Movil)",
  Accept: "image/png,image/*;q=0.8",
};

// Proyección estándar Web Mercator (EPSG:3857) a píxeles globales para un nivel de zoom z
function latLonAPixelGlobal(
  latitud: number,
  longitud: number,
  zoom: number,
): { x: number; y: number } {
  const escala = Math.pow(2, zoom) * TAMANO_TILE;
  const x = ((longitud + 180) / 360) * escala;
  const latRad = (latitud * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    escala;
  return { x, y };
}

function pixelGlobalALatLon(
  x: number,
  y: number,
  zoom: number,
): Coordenadas {
  const escala = Math.pow(2, zoom) * TAMANO_TILE;
  const longitud = (x / escala) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / escala;
  const latitud =
    (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return {
    latitud: Math.max(-34, Math.min(-30, latitud)),
    longitud: Math.max(-60, Math.min(-56, longitud)),
  };
}

function estiloPinPorCategoria(categoriaId: string): {
  color: string;
  icono:
    | "sunny"
    | "flame"
    | "business"
    | "leaf"
    | "restaurant"
    | "color-palette"
    | "location";
} {
  switch (categoriaId) {
    case "cat-playas":
      return { color: "#0284C7", icono: "sunny" };
    case "cat-termas":
      return { color: "#EA580C", icono: "flame" };
    case "cat-museos":
      return { color: "#7C3AED", icono: "business" };
    case "cat-naturaleza":
      return { color: "#15803D", icono: "leaf" };
    case "cat-gastronomia":
      return { color: "#BE123C", icono: "restaurant" };
    case "cat-artesanias":
      return { color: "#B45309", icono: "color-palette" };
    default:
      return { color: "#1B4F72", icono: "location" };
  }
}

export default function MapaLugares({
  lugares,
  ubicacionUsuario,
  alSeleccionarLugar,
  altura = 320,
  zoomInicial = 15,
  centroInicial,
  modoCompacto = false,
  alInteractuarMapa,
}: PropsMapaLugares) {
  // Por defecto elegimos un lugar del casco urbano de Colón para que la vista inicial muestre las calles y la costanera bien distribuidas
  const lugarUrbanoInicial = useMemo(() => {
    if (lugares.length === 0) return null;
    const enCiudad = lugares.find(
      (l) =>
        l.coordenadas.latitud <= -32.195 &&
        l.coordenadas.latitud >= -32.24 &&
        l.coordenadas.longitud >= -58.165,
    );
    return enCiudad || lugares[0];
  }, [lugares]);

  const [zoom, setZoom] = useState<number>(zoomInicial);
  const [escalaPinch, setEscalaPinch] = useState<number>(1);
  const [centroManual, setCentroManual] = useState<Coordenadas | null>(null);
  const [lugarSeleccionadoId, setLugarSeleccionadoId] = useState<string | null>(
    null,
  );
  const [dimensiones, setDimensiones] = useState({ ancho: 360, alto: altura });
  const [vistaActiva, setVistaActiva] = useState<
    "ciudad" | "colonia" | "region"
  >("ciudad");
  const [capaSatelite, setCapaSatelite] = useState(false);

  const centro = useMemo<Coordenadas>(() => {
    if (centroManual) return centroManual;
    if (centroInicial) return centroInicial;
    if (lugares.length === 1) return lugares[0].coordenadas;
    return CENTRO_CIUDAD_COLON;
  }, [centroManual, centroInicial, lugares]);

  const lugarPinActivo = useMemo<Lugar | null>(() => {
    if (lugares.length === 0) return null;
    if (lugarSeleccionadoId) {
      const encontrado = lugares.find((l) => l.id === lugarSeleccionadoId);
      if (encontrado) return encontrado;
    }
    return lugarUrbanoInicial || lugares[0];
  }, [lugares, lugarSeleccionadoId, lugarUrbanoInicial]);

  // Estado interno de gestos multitáctiles (1 dedo = arrastrar, 2 dedos = pellizcar para zoom, doble toque = acercar)
  const estadoGestoRef = useRef<{
    modo: "pan" | "pinch";
    startX: number;
    startY: number;
    pixelCentroX: number;
    pixelCentroY: number;
    distanciaInicial: number;
    zoomBase: number;
    centroLatInicial: number;
    centroLonInicial: number;
  } | null>(null);

  const ultimoToqueMsRef = useRef<number>(0);

  const iniciarGestoConTouches = (e: GestureResponderEvent) => {
    alInteractuarMapa?.(true);
    const touches = e.nativeEvent.touches;

    if (touches.length >= 2) {
      const t0 = touches[0];
      const t1 = touches[1];
      const dist = Math.max(
        20,
        Math.hypot(t1.pageX - t0.pageX, t1.pageY - t0.pageY),
      );
      const midX = (t0.pageX + t1.pageX) / 2;
      const midY = (t0.pageY + t1.pageY) / 2;
      const p = latLonAPixelGlobal(centro.latitud, centro.longitud, zoom);

      estadoGestoRef.current = {
        modo: "pinch",
        startX: midX,
        startY: midY,
        pixelCentroX: p.x,
        pixelCentroY: p.y,
        distanciaInicial: dist,
        zoomBase: zoom,
        centroLatInicial: centro.latitud,
        centroLonInicial: centro.longitud,
      };
      return;
    }

    if (touches.length === 1) {
      const ahora = Date.now();
      const deltaMs = ahora - ultimoToqueMsRef.current;
      ultimoToqueMsRef.current = ahora;

      // Doble toque rápido en el mapa acerca 1 nivel de zoom
      if (deltaMs > 40 && deltaMs < 280) {
        setZoom((z) => Math.min(ZOOM_MAX, z + 1));
        estadoGestoRef.current = null;
        return;
      }

      const t0 = touches[0];
      const p = latLonAPixelGlobal(centro.latitud, centro.longitud, zoom);
      estadoGestoRef.current = {
        modo: "pan",
        startX: t0.pageX,
        startY: t0.pageY,
        pixelCentroX: p.x,
        pixelCentroY: p.y,
        distanciaInicial: 1,
        zoomBase: zoom,
        centroLatInicial: centro.latitud,
        centroLonInicial: centro.longitud,
      };
    }
  };

  const moverGestoConTouches = (e: GestureResponderEvent) => {
    const touches = e.nativeEvent.touches;

    // Si el usuario pasó de 1 dedo a 2 dedos en medio del movimiento, inicializamos el pinch
    if (
      touches.length >= 2 &&
      (!estadoGestoRef.current || estadoGestoRef.current.modo !== "pinch")
    ) {
      iniciarGestoConTouches(e);
      return;
    }

    const gesto = estadoGestoRef.current;
    if (!gesto) return;

    if (touches.length >= 2 && gesto.modo === "pinch") {
      const t0 = touches[0];
      const t1 = touches[1];
      const distActual = Math.max(
        10,
        Math.hypot(t1.pageX - t0.pageX, t1.pageY - t0.pageY),
      );
      const midX = (t0.pageX + t1.pageX) / 2;
      const midY = (t0.pageY + t1.pageY) / 2;

      const zoomContinuo = Math.max(
        ZOOM_MIN,
        Math.min(
          ZOOM_MAX,
          gesto.zoomBase + Math.log2(distActual / gesto.distanciaInicial),
        ),
      );
      const nuevoZoomEntero = Math.round(zoomContinuo);
      const escalaResidual = Math.pow(2, zoomContinuo - nuevoZoomEntero);

      setEscalaPinch(escalaResidual);

      if (nuevoZoomEntero !== zoom) {
        setZoom(nuevoZoomEntero);
      }

      // También permitir desplazar el centro mientras se pellizca con dos dedos
      const dx = midX - gesto.startX;
      const dy = midY - gesto.startY;
      const pixelBaseEnNuevoZoom = latLonAPixelGlobal(
        gesto.centroLatInicial,
        gesto.centroLonInicial,
        nuevoZoomEntero,
      );
      const nuevoCentro = pixelGlobalALatLon(
        pixelBaseEnNuevoZoom.x - dx,
        pixelBaseEnNuevoZoom.y - dy,
        nuevoZoomEntero,
      );
      setCentroManual(nuevoCentro);
      return;
    }

    if (touches.length === 1 && gesto.modo === "pan") {
      const t0 = touches[0];
      const dx = t0.pageX - gesto.startX;
      const dy = t0.pageY - gesto.startY;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;

      const nuevoCentro = pixelGlobalALatLon(
        gesto.pixelCentroX - dx,
        gesto.pixelCentroY - dy,
        gesto.zoomBase,
      );
      setCentroManual(nuevoCentro);
    }
  };

  const finalizarGesto = (e: GestureResponderEvent) => {
    const touchesRestantes = e.nativeEvent.touches?.length ?? 0;
    if (touchesRestantes === 1 && estadoGestoRef.current?.modo === "pinch") {
      // Si soltó uno de los dos dedos, continuar suavemente con arrastre de 1 dedo
      const t0 = e.nativeEvent.touches[0];
      const p = latLonAPixelGlobal(centro.latitud, centro.longitud, zoom);
      setEscalaPinch(1);
      estadoGestoRef.current = {
        modo: "pan",
        startX: t0.pageX,
        startY: t0.pageY,
        pixelCentroX: p.x,
        pixelCentroY: p.y,
        distanciaInicial: 1,
        zoomBase: zoom,
        centroLatInicial: centro.latitud,
        centroLonInicial: centro.longitud,
      };
      return;
    }

    setEscalaPinch(1);
    estadoGestoRef.current = null;
    alInteractuarMapa?.(false);
  };

  const cambiarVista = (modo: "ciudad" | "colonia" | "region") => {
    setVistaActiva(modo);
    setEscalaPinch(1);
    if (modo === "ciudad") {
      setCentroManual(CENTRO_CIUDAD_COLON);
      setZoom(15);
    } else if (modo === "colonia") {
      setCentroManual(CENTRO_COLONIA_SAN_JOSE);
      setZoom(12);
    } else {
      setCentroManual(CENTRO_REGION_PALMAR);
      setZoom(10);
    }
  };

  const centrarEnLugar = (lugar: Lugar) => {
    setLugarSeleccionadoId(lugar.id);
    setCentroManual(lugar.coordenadas);
    if (lugar.coordenadas.latitud > -32.0 || lugar.coordenadas.longitud < -58.3) {
      if (zoom > 13) setZoom(12);
    } else if (zoom < 14) {
      setZoom(15);
    }
  };

  const abrirEnGoogleMapsExterno = (lugar: Lugar) => {
    const { latitud, longitud } = lugar.coordenadas;
    const query = encodeURIComponent(`${lugar.nombre}, Colón, Entre Ríos`);
    const url = `https://www.google.com/maps/search/?api=1&query=${latitud},${longitud}&query_place_id=${query}`;
    Linking.openURL(url).catch(() => {});
  };

  const pixelCentro = latLonAPixelGlobal(
    centro.latitud,
    centro.longitud,
    zoom,
  );
  const origenViewportX = pixelCentro.x - dimensiones.ancho / 2;
  const origenViewportY = pixelCentro.y - dimensiones.alto / 2;

  // Calcular qué cuadrículas (tiles 256x256) de OpenStreetMap / Esri World Street Map cubren el visor actual (con margen extra para arrastre fluido)
  const tilesVisibles = useMemo(() => {
    const maxTile = Math.pow(2, zoom) - 1;
    const minTileX = Math.max(
      0,
      Math.floor((origenViewportX - 128) / TAMANO_TILE),
    );
    const maxTileX = Math.min(
      maxTile,
      Math.floor((origenViewportX + dimensiones.ancho + 128) / TAMANO_TILE),
    );
    const minTileY = Math.max(
      0,
      Math.floor((origenViewportY - 128) / TAMANO_TILE),
    );
    const maxTileY = Math.min(
      maxTile,
      Math.floor((origenViewportY + dimensiones.alto + 128) / TAMANO_TILE),
    );

    const lista: {
      key: string;
      urlPrimaria: string;
      urlSecundaria: string;
      left: number;
      top: number;
    }[] = [];

    for (let tx = minTileX; tx <= maxTileX; tx++) {
      for (let ty = minTileY; ty <= maxTileY; ty++) {
        const urlCalles = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${zoom}/${ty}/${tx}`;
        const urlSatelite = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`;
        const urlOsm = `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;

        lista.push({
          key: `${capaSatelite ? "sat" : "map"}-${zoom}-${tx}-${ty}`,
          urlPrimaria: capaSatelite ? urlSatelite : urlCalles,
          urlSecundaria: urlOsm,
          left: Math.round(tx * TAMANO_TILE - origenViewportX),
          top: Math.round(ty * TAMANO_TILE - origenViewportY),
        });
      }
    }
    return lista;
  }, [zoom, origenViewportX, origenViewportY, dimensiones, capaSatelite]);

  // Calcular posiciones en pantalla de los marcadores y separar ligeramente los que están muy juntos para que nunca se tapen
  const marcadoresEnPantalla = useMemo(() => {
    const crudos = lugares.map((lugar) => {
      const p = latLonAPixelGlobal(
        lugar.coordenadas.latitud,
        lugar.coordenadas.longitud,
        zoom,
      );
      return {
        lugar,
        x: p.x - origenViewportX,
        y: p.y - origenViewportY,
      };
    });

    const colocados: { lugar: Lugar; x: number; y: number }[] = [];
    const DISTANCIA_MIN_PX = 28;

    for (const item of crudos) {
      let xFinal = item.x;
      let yFinal = item.y;
      let intento = 0;

      while (
        intento < 10 &&
        colocados.some(
          (otro) =>
            Math.hypot(otro.x - xFinal, otro.y - yFinal) < DISTANCIA_MIN_PX,
        )
      ) {
        intento++;
        const angulo = (intento * Math.PI) / 3;
        const radio = 15 + Math.floor((intento - 1) / 6) * 12;
        xFinal = item.x + Math.cos(angulo) * radio;
        yFinal = item.y + Math.sin(angulo) * radio;
      }

      colocados.push({ lugar: item.lugar, x: xFinal, y: yFinal });
    }

    return colocados.filter(
      (m) =>
        m.x >= -40 &&
        m.x <= dimensiones.ancho + 40 &&
        m.y >= -40 &&
        m.y <= dimensiones.alto + 40,
    );
  }, [lugares, zoom, origenViewportX, origenViewportY, dimensiones]);

  // Posición del punto azul de GPS del usuario si está dentro del área visible
  const puntoUsuarioPantalla = useMemo(() => {
    if (!ubicacionUsuario) return null;
    const p = latLonAPixelGlobal(
      ubicacionUsuario.latitud,
      ubicacionUsuario.longitud,
      zoom,
    );
    const x = p.x - origenViewportX;
    const y = p.y - origenViewportY;
    if (
      x < 0 ||
      x > dimensiones.ancho ||
      y < 0 ||
      y > dimensiones.alto
    ) {
      return null;
    }
    return { x, y };
  }, [ubicacionUsuario, zoom, origenViewportX, origenViewportY, dimensiones]);

  const manejarLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setDimensiones({ ancho: width, alto: height });
    }
  };

  return (
    <View style={styles.tarjetaMapa}>
      {/* Barra superior separada del lienzo para que ningún pin tape los textos ni botones */}
      {!modoCompacto && (
        <View style={styles.barraSuperior}>
          <View style={styles.filaTitulo}>
            <Ionicons name="map" size={16} color="#1B4F72" />
            <Text style={styles.textoTituloMapa}>
              Mapa interactivo ({lugares.length} lugares)
            </Text>
          </View>

          <View style={styles.selectorRegiones}>
            <Pressable
              style={[
                styles.chipRegion,
                vistaActiva === "ciudad" && styles.chipRegionActivo,
              ]}
              onPress={() => cambiarVista("ciudad")}
            >
              <Text
                style={[
                  styles.textoChipRegion,
                  vistaActiva === "ciudad" && styles.textoChipRegionActivo,
                ]}
              >
                Ciudad
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.chipRegion,
                vistaActiva === "colonia" && styles.chipRegionActivo,
              ]}
              onPress={() => cambiarVista("colonia")}
            >
              <Text
                style={[
                  styles.textoChipRegion,
                  vistaActiva === "colonia" && styles.textoChipRegionActivo,
                ]}
              >
                Colonia
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.chipRegion,
                vistaActiva === "region" && styles.chipRegionActivo,
              ]}
              onPress={() => cambiarVista("region")}
            >
              <Text
                style={[
                  styles.textoChipRegion,
                  vistaActiva === "region" && styles.textoChipRegionActivo,
                ]}
              >
                El Palmar
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.chipRegion,
                capaSatelite && styles.chipRegionActivo,
              ]}
              onPress={() => setCapaSatelite((v) => !v)}
            >
              <Text
                style={[
                  styles.textoChipRegion,
                  capaSatelite && styles.textoChipRegionActivo,
                ]}
              >
                {capaSatelite ? "Calles" : "Satélite"}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Visor del mapa con soporte completo de arrastrar con 1 dedo y zoom pellizcando con 2 dedos */}
      <View
        style={[styles.visorMapa, { height: altura }]}
        onLayout={manejarLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onTouchStart={iniciarGestoConTouches}
        onTouchMove={moverGestoConTouches}
        onTouchEnd={finalizarGesto}
        onTouchCancel={finalizarGesto}
      >
        {/* Capa escalable durante el gesto de pellizco (pinch-to-zoom) */}
        <View
          style={[
            styles.capaInteractiva,
            escalaPinch !== 1 && { transform: [{ scale: escalaPinch }] },
          ]}
        >
          {/* Fondo urbano de respaldo (se ve mientras cargan los tiles o sin internet) */}
          <View style={styles.fondoRespaldoOffline}>
            <View style={styles.franjaRioOffline}>
              <Text style={styles.textoRioOffline}>Río Uruguay</Text>
            </View>
          </View>

          {/* Cuadrícula de tiles reales de calles/satélite sin marca de agua ni API key */}
          {tilesVisibles.map((tile) => (
            <Image
              key={tile.key}
              source={[
                { uri: tile.urlPrimaria, headers: HEADERS_TILE_MAPA },
                { uri: tile.urlSecundaria, headers: HEADERS_TILE_MAPA },
              ]}
              style={[
                styles.tileImagen,
                {
                  left: tile.left,
                  top: tile.top,
                },
              ]}
              cachePolicy="memory-disk"
              contentFit="cover"
            />
          ))}

          {/* Punto azul de ubicación GPS actual del turista */}
          {puntoUsuarioPantalla && (
            <View
              style={[
                styles.puntoUsuario,
                {
                  left: puntoUsuarioPantalla.x - 8,
                  top: puntoUsuarioPantalla.y - 8,
                },
              ]}
            />
          )}

          {/* Marcadores de lugares categorizados por color e ícono */}
          {marcadoresEnPantalla.map(({ lugar, x, y }) => {
            const seleccionado = lugarPinActivo?.id === lugar.id;
            const estiloCat = estiloPinPorCategoria(lugar.categoriaId);
            return (
              <Pressable
                key={lugar.id}
                style={[
                  styles.pinContenedor,
                  {
                    left: x - (seleccionado ? 18 : 14),
                    top: y - (seleccionado ? 36 : 28),
                  },
                  seleccionado && styles.pinContenedorActivo,
                ]}
                onPress={() => setLugarSeleccionadoId(lugar.id)}
                hitSlop={6}
              >
                <View
                  style={[
                    styles.globoPin,
                    {
                      backgroundColor: seleccionado
                        ? "#C0392B"
                        : estiloCat.color,
                    },
                    seleccionado && styles.globoPinActivo,
                  ]}
                >
                  <Ionicons
                    name={estiloCat.icono}
                    size={seleccionado ? 16 : 13}
                    color="#FFFFFF"
                  />
                </View>
                <View
                  style={[
                    styles.puntaPin,
                    {
                      borderTopColor: seleccionado
                        ? "#C0392B"
                        : estiloCat.color,
                    },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>

        {/* Controles flotantes de Zoom (+/-) a la derecha */}
        <View style={styles.controlesZoom}>
          <Pressable
            style={styles.botonZoom}
            onPress={() => setZoom((z) => Math.min(ZOOM_MAX, z + 1))}
            accessibilityLabel="Acercar mapa"
          >
            <Ionicons name="add" size={20} color="#1B4F72" />
          </Pressable>
          <View style={styles.divisorZoom} />
          <Pressable
            style={styles.botonZoom}
            onPress={() => setZoom((z) => Math.max(ZOOM_MIN, z - 1))}
            accessibilityLabel="Alejar mapa"
          >
            <Ionicons name="remove" size={20} color="#1B4F72" />
          </Pressable>
        </View>

        {/* Tarjeta inferior flotante del lugar seleccionado */}
        {lugarPinActivo && !modoCompacto && (
          <View style={styles.calloutFlotante}>
            <Pressable
              style={styles.infoCallout}
              onPress={() => alSeleccionarLugar(lugarPinActivo.id)}
            >
              <Text style={styles.tituloCallout} numberOfLines={1}>
                📍 {lugarPinActivo.nombre}
              </Text>
              <Text style={styles.distanciaCallout} numberOfLines={1}>
                {ubicacionUsuario
                  ? `${formatearDistancia(
                      calcularDistanciaMetros(
                        ubicacionUsuario,
                        lugarPinActivo.coordenadas,
                      ),
                    )} · ${lugarPinActivo.direccion}`
                  : lugarPinActivo.direccion}
              </Text>
            </Pressable>

            <Pressable
              style={styles.botonCentrarPin}
              onPress={() => centrarEnLugar(lugarPinActivo)}
              accessibilityLabel="Centrar en este lugar"
            >
              <Ionicons name="locate" size={16} color="#1B4F72" />
            </Pressable>

            <Pressable
              style={styles.botonVerDetalle}
              onPress={() => alSeleccionarLugar(lugarPinActivo.id)}
            >
              <Text style={styles.accionCallout}>Ver →</Text>
            </Pressable>
          </View>
        )}

        {/* En modo compacto (pantalla de detalle de un lugar), botón directo para abrir en Google Maps */}
        {modoCompacto && lugares[0] && (
          <Pressable
            style={styles.botonGoogleMapsCompacto}
            onPress={() => abrirEnGoogleMapsExterno(lugares[0])}
          >
            <Ionicons name="navigate" size={14} color="#FFFFFF" />
            <Text style={styles.textoGoogleMapsCompacto}>
              Abrir en Google Maps
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjetaMapa: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#B8D4E8",
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
    elevation: 2,
  },
  barraSuperior: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#F4F9FD",
    borderBottomWidth: 1,
    borderBottomColor: "#DCE8F2",
    flexWrap: "wrap",
    gap: 6,
  },
  filaTitulo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  textoTituloMapa: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1B4F72",
  },
  selectorRegiones: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  chipRegion: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "#E5EEF5",
  },
  chipRegionActivo: {
    backgroundColor: "#1B4F72",
  },
  textoChipRegion: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2C3E50",
  },
  textoChipRegionActivo: {
    color: "#FFFFFF",
  },
  visorMapa: {
    width: "100%",
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#E8EFF4",
  },
  capaInteractiva: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  fondoRespaldoOffline: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#EEF3E8",
  },
  franjaRioOffline: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "20%",
    backgroundColor: "#A9D6E5",
    justifyContent: "center",
    alignItems: "center",
  },
  textoRioOffline: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1B4F72",
    transform: [{ rotate: "-90deg" }],
  },
  tileImagen: {
    position: "absolute",
    width: TAMANO_TILE,
    height: TAMANO_TILE,
  },
  pinContenedor: {
    position: "absolute",
    alignItems: "center",
    zIndex: 5,
  },
  pinContenedorActivo: {
    zIndex: 25,
    transform: [{ scale: 1.12 }],
  },
  globoPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    elevation: 4,
  },
  globoPinActivo: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
  },
  puntaPin: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -1,
  },
  puntoUsuario: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#2563EB",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    zIndex: 20,
    elevation: 4,
  },
  controlesZoom: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    elevation: 4,
    zIndex: 30,
    overflow: "hidden",
  },
  botonZoom: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  divisorZoom: {
    height: 1,
    backgroundColor: "#E2E8F0",
  },
  calloutFlotante: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    backgroundColor: "rgba(255, 255, 255, 0.97)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    elevation: 6,
    gap: 8,
    zIndex: 30,
  },
  infoCallout: {
    flex: 1,
  },
  tituloCallout: {
    fontWeight: "800",
    fontSize: 14,
    color: "#1B2631",
  },
  distanciaCallout: {
    fontSize: 12,
    color: "#4D5656",
    marginTop: 2,
  },
  botonCentrarPin: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#EBF5FB",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#AED6F1",
  },
  botonVerDetalle: {
    backgroundColor: "#1B4F72",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  accionCallout: {
    fontSize: 12,
    color: "#FFFFFF",
    fontWeight: "800",
  },
  botonGoogleMapsCompacto: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: "#1B4F72",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    elevation: 4,
    zIndex: 30,
  },
  textoGoogleMapsCompacto: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
});
