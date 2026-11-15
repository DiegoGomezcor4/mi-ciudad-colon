import { useEffect, useState } from "react";
import { Appearance, useColorScheme } from "react-native";
import { Preferencias } from "../tipos";
import {
  obtenerPreferenciasLocales,
  obtenerPreferenciasSincronas,
  suscribirPreferencias,
} from "./preferencias";

export interface PaletaColores {
  fondo: string;
  tarjeta: string;
  tarjetaSecundaria: string;
  superficieSecundaria: string;
  texto: string;
  textoPrimario: string;
  textoSecundario: string;
  textoTerciario: string;
  borde: string;
  primario: string;
  acento: string;
  encabezado: string;
  tabBarra: string;
  inputFondo: string;
  fondoInput: string;
}

const PALETA_CLARA: PaletaColores = {
  fondo: "#F4F6F8",
  tarjeta: "#FFFFFF",
  tarjetaSecundaria: "#EBF5FB",
  superficieSecundaria: "#EBF5FB",
  texto: "#1B2631",
  textoPrimario: "#1B2631",
  textoSecundario: "#5D6D7E",
  textoTerciario: "#7F8C8D",
  borde: "#DCE1E7",
  primario: "#1B4F72",
  acento: "#1B4F72",
  encabezado: "#1B4F72",
  tabBarra: "#FFFFFF",
  inputFondo: "#F9FAFB",
  fondoInput: "#F9FAFB",
};

const PALETA_OSCURA: PaletaColores = {
  fondo: "#0F172A",
  tarjeta: "#1E293B",
  tarjetaSecundaria: "#172554",
  superficieSecundaria: "#172554",
  texto: "#F1F5F9",
  textoPrimario: "#F1F5F9",
  textoSecundario: "#94A3B8",
  textoTerciario: "#64748B",
  borde: "#334155",
  primario: "#38BDF8",
  acento: "#38BDF8",
  encabezado: "#0B1120",
  tabBarra: "#1E293B",
  inputFondo: "#0F172A",
  fondoInput: "#0F172A",
};

export function aplicarTemaNativo(tema: Preferencias["tema"]): void {
  try {
    if (typeof Appearance?.setColorScheme === "function") {
      if (tema === "oscuro") {
        Appearance.setColorScheme("dark");
      } else if (tema === "claro") {
        Appearance.setColorScheme("light");
      } else {
        Appearance.setColorScheme("unspecified");
      }
    }
  } catch {}
}

export function useTema(): {
  esOscuro: boolean;
  temaPreferido: Preferencias["tema"];
  colores: PaletaColores;
} {
  const esquemaSistema = useColorScheme();
  const [temaPreferido, setTemaPreferido] = useState<Preferencias["tema"]>(
    () => obtenerPreferenciasSincronas().tema,
  );

  useEffect(() => {
    void obtenerPreferenciasLocales().then((prefs) => {
      setTemaPreferido(prefs.tema);
    });

    const desuscribir = suscribirPreferencias((prefs) => {
      setTemaPreferido(prefs.tema);
      aplicarTemaNativo(prefs.tema);
    });

    return desuscribir;
  }, []);

  const esOscuro =
    temaPreferido === "oscuro" ||
    (temaPreferido === "sistema" && esquemaSistema === "dark");

  return {
    esOscuro,
    temaPreferido,
    colores: esOscuro ? PALETA_OSCURA : PALETA_CLARA,
  };
}
