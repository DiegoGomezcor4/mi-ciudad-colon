import { Ionicons } from "@react-native-vector-icons/ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { obtenerLugares } from "../../servicios/lugares";
import {
  obtenerPreferenciasLocales,
  PREFERENCIAS_POR_DEFECTO,
} from "../../servicios/preferencias";
import { autenticarConBiometria } from "../../servicios/seguridad";
import {
  actualizarPreferenciasUsuario,
  cambiarEstadoFavorito,
  cerrarSesionUsuario,
  iniciarSesionUsuario,
  obtenerMisFavoritos,
  obtenerPerfilActual,
} from "../../servicios/usuario";
import { Favorito, Lugar, Preferencias, Usuario } from "../../tipos";

const RADIOS_DISPONIBLES = [100, 250, 500];
const TEMAS_DISPONIBLES: Preferencias["tema"][] = [
  "claro",
  "oscuro",
  "sistema",
];

export default function PantallaPerfilYFavoritos() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [bloqueadoBiometria, setBloqueadoBiometria] = useState(false);
  const [email, setEmail] = useState("lucia@mail.com");
  const [contrasena, setContrasena] = useState("lucia1234");
  const [favoritos, setFavoritos] = useState<Favorito[]>([]);
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [preferencias, setPreferencias] = useState<Preferencias>(
    PREFERENCIAS_POR_DEFECTO,
  );

  const cargarDatos = useCallback(async () => {
    const [perfil, resFavs, resLugares, prefs] = await Promise.all([
      obtenerPerfilActual(),
      obtenerMisFavoritos(),
      obtenerLugares(),
      obtenerPreferenciasLocales(),
    ]);
    setFavoritos(resFavs.datos);
    setLugares(resLugares.datos);
    setPreferencias(prefs);
    if (perfil && !usuario) {
      setBloqueadoBiometria(true);
      setUsuario(perfil);
    }
  }, [usuario]);

  useFocusEffect(
    useCallback(() => {
      cargarDatos();
    }, [cargarDatos]),
  );

  const manejarLogin = async () => {
    if (!email.trim()) {
      Alert.alert("Campo requerido", "Ingresá tu correo electrónico.");
      return;
    }
    const { usuario: nuevoUsuario } = await iniciarSesionUsuario(
      email,
      contrasena,
    );
    setUsuario(nuevoUsuario);
    setBloqueadoBiometria(false);
    Alert.alert(
      "Sesión iniciada",
      "Tu token quedó resguardado en expo-secure-store para sincronizar tus favoritos y recorrido.",
    );
  };

  const manejarDesbloqueoRapido = async () => {
    const ok = await autenticarConBiometria();
    if (ok) {
      setBloqueadoBiometria(false);
    } else {
      Alert.alert(
        "Verificación cancelada",
        "Podés intentar nuevamente o ingresar con tu contraseña.",
      );
    }
  };

  const manejarCerrarSesion = async () => {
    await cerrarSesionUsuario();
    setUsuario(null);
    setBloqueadoBiometria(false);
  };

  const cambiarPreferencia = async (parcial: Partial<Preferencias>) => {
    const nuevas: Preferencias = { ...preferencias, ...parcial };
    setPreferencias(nuevas);
    await actualizarPreferenciasUsuario(nuevas);
  };

  const quitarDeFavoritos = async (lugarId: string) => {
    await cambiarEstadoFavorito(lugarId);
    const resFavs = await obtenerMisFavoritos();
    setFavoritos(resFavs.datos);
  };

  return (
    <ScrollView style={styles.contenedor}>
      {/* 1. Sección Favoritos (accesible con o sin cuenta, PDF pág. 3) */}
      <View style={styles.bloque}>
        <Text style={styles.tituloSeccion}>
          ★ Mis lugares favoritos ({favoritos.length})
        </Text>
        {favoritos.length === 0 ? (
          <Text style={styles.textoSecundario}>
            Tocá la estrella ☆ en el detalle de cualquier lugar para guardarlo
            acá.
          </Text>
        ) : (
          favoritos.map((fav) => {
            const lug = lugares.find((l) => l.id === fav.lugarId);
            if (!lug) return null;
            return (
              <View key={fav.id} style={styles.filaFavorito}>
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() => router.push(`/lugares/${lug.id}`)}
                >
                  <Text style={styles.nombreFavorito}>{lug.nombre}</Text>
                  <Text style={styles.direccionFavorito}>{lug.direccion}</Text>
                </Pressable>
                <Pressable
                  style={styles.botonQuitarFav}
                  onPress={() => quitarDeFavoritos(lug.id)}
                >
                  <Ionicons name="trash-outline" size={20} color="#C0392B" />
                </Pressable>
              </View>
            );
          })
        )}
      </View>

      {/* 2. Sección Cuenta y Reingreso Rápido (SecureStore + Biometría) */}
      <View style={styles.bloque}>
        <Text style={styles.tituloSeccion}>👤 Mi Cuenta (Sincronización)</Text>
        {!usuario ? (
          <View>
            <Text style={styles.textoSecundario}>
              No necesitás cuenta para usar el mapa. Iniciá sesión solo si
              querés respaldar tus favoritos y recorrido para otro teléfono o el
              año que viene.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Correo electrónico"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              placeholder="Contraseña"
              value={contrasena}
              onChangeText={setContrasena}
              secureTextEntry
            />
            <Pressable style={styles.botonPrimario} onPress={manejarLogin}>
              <Text style={styles.textoBotonPrimario}>Iniciar sesión</Text>
            </Pressable>
          </View>
        ) : bloqueadoBiometria ? (
          <View style={styles.cajaBiometria}>
            <Text style={styles.textoSecundario}>
              Sesión guardada de {usuario.nombre} ({usuario.email}).
            </Text>
            <Pressable
              style={styles.botonPrimario}
              onPress={manejarDesbloqueoRapido}
            >
              <Ionicons
                name="finger-print-outline"
                size={22}
                color="#FFFFFF"
              />
              <Text style={styles.textoBotonPrimario}>
                Entrar rápido con huella o rostro
              </Text>
            </Pressable>
            <Pressable
              style={styles.botonCerrar}
              onPress={manejarCerrarSesion}
            >
              <Text style={styles.textoCerrar}>Usar otra cuenta</Text>
            </Pressable>
          </View>
        ) : (
          <View>
            <Text style={styles.nombreUsuario}>{usuario.nombre}</Text>
            <Text style={styles.textoSecundario}>{usuario.email}</Text>
            <Text style={styles.badgeSeguridad}>
              🔒 Token Bearer activo en expo-secure-store
            </Text>
            <Pressable
              style={styles.botonCerrar}
              onPress={manejarCerrarSesion}
            >
              <Text style={styles.textoCerrar}>Cerrar sesión</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* 3. Preferencias en expo-sqlite/kv-store */}
      <View style={styles.bloque}>
        <Text style={styles.tituloSeccion}>⚙️ Preferencias (kv-store)</Text>

        <View style={styles.filaSwitch}>
          <View style={{ flex: 1 }}>
            <Text style={styles.etiquetaPref}>Avisar lugares cercanos</Text>
            <Text style={styles.subtextoPref}>
              Máximo 1 aviso por lugar y por día
            </Text>
          </View>
          <Switch
            value={preferencias.avisarProximidad}
            onValueChange={(valor) =>
              cambiarPreferencia({ avisarProximidad: valor })
            }
          />
        </View>

        <Text style={styles.etiquetaPref}>Radio de aviso de proximidad</Text>
        <View style={styles.filaOpciones}>
          {RADIOS_DISPONIBLES.map((radio) => {
            const activo = preferencias.radioAvisoMetros === radio;
            return (
              <Pressable
                key={radio}
                style={[styles.chipOpcion, activo && styles.chipOpcionActivo]}
                onPress={() => cambiarPreferencia({ radioAvisoMetros: radio })}
              >
                <Text
                  style={[
                    styles.textoChipOpcion,
                    activo && styles.textoChipOpcionActivo,
                  ]}
                >
                  {radio} m
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.etiquetaPref}>Tema de apariencia</Text>
        <View style={styles.filaOpciones}>
          {TEMAS_DISPONIBLES.map((tema) => {
            const activo = preferencias.tema === tema;
            return (
              <Pressable
                key={tema}
                style={[styles.chipOpcion, activo && styles.chipOpcionActivo]}
                onPress={() => cambiarPreferencia({ tema })}
              >
                <Text
                  style={[
                    styles.textoChipOpcion,
                    activo && styles.textoChipOpcionActivo,
                  ]}
                >
                  {tema.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: "#F4F6F8",
    padding: 14,
  },
  bloque: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#DCE1E7",
  },
  tituloSeccion: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1B2631",
    marginBottom: 10,
  },
  textoSecundario: {
    fontSize: 14,
    color: "#4D5656",
    lineHeight: 20,
    marginBottom: 12,
  },
  filaFavorito: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F2F4F4",
  },
  nombreFavorito: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1B4F72",
  },
  direccionFavorito: {
    fontSize: 13,
    color: "#5D6D7E",
  },
  botonQuitarFav: {
    padding: 8,
  },
  input: {
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#CFD8DC",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    marginBottom: 10,
    color: "#1B2631",
  },
  botonPrimario: {
    flexDirection: "row",
    backgroundColor: "#1B4F72",
    paddingVertical: 14,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  textoBotonPrimario: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 16,
  },
  cajaBiometria: {
    gap: 8,
  },
  nombreUsuario: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1B2631",
  },
  badgeSeguridad: {
    fontSize: 13,
    color: "#1E8449",
    fontWeight: "700",
    marginBottom: 12,
  },
  botonCerrar: {
    marginTop: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  textoCerrar: {
    color: "#C0392B",
    fontWeight: "700",
    fontSize: 15,
  },
  filaSwitch: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  etiquetaPref: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1B2631",
    marginBottom: 6,
  },
  subtextoPref: {
    fontSize: 13,
    color: "#5D6D7E",
  },
  filaOpciones: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  chipOpcion: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#E5E8EC",
    alignItems: "center",
  },
  chipOpcionActivo: {
    backgroundColor: "#1B4F72",
  },
  textoChipOpcion: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2C3E50",
  },
  textoChipOpcionActivo: {
    color: "#FFFFFF",
  },
});
