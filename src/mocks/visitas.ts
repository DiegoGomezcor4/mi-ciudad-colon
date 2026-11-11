import { Visita } from "../tipos";

export const VISITAS_MOCK: Visita[] = [
  {
    id: "vis-311",
    usuarioId: "usr-201",
    lugarId: "lug-004",
    fechaHora: "2026-11-10T16:42:00-03:00",
    origen: "qr",
    fotoUri: null,
    nota: "Increíble la historia de los colonos suizos y el mecanismo del molino.",
    sincronizada: true,
  },
  {
    id: "vis-312",
    usuarioId: "usr-201",
    lugarId: "lug-003",
    fechaHora: "2026-11-11T10:15:00-03:00",
    origen: "gps",
    fotoUri: null,
    nota: "Vimos carpinchos cerca del arroyo El Palmar. No había señal en el parque.",
    sincronizada: false,
  },
];
