import { Evento } from "../tipos";

export const EVENTOS_MOCK: Evento[] = [
  {
    id: "evt-017",
    titulo: "Peña Folclórica en el Puerto",
    descripcion:
      "Noche de música litoraleña, chamarritas y danzas tradicionales con artistas locales y feria gastronómica junto al río.",
    lugarId: "lug-002",
    direccionLibre: null,
    coordenadas: null,
    inicio: "2026-11-11T21:00:00-03:00",
    fin: "2026-11-12T01:30:00-03:00",
    imagenUrl: "https://api.colon.tur.ar/img/pena.jpg",
    precio: 0,
    estado: "programado",
  },
  {
    id: "evt-018",
    titulo: "Visita Guiada Histórica al Molino Forclaz",
    descripcion:
      "Recorrido teatralizado por el molino de viento de 1888 reviviendo la vida cotidiana de los primeros colonos suizos.",
    lugarId: "lug-004",
    direccionLibre: null,
    coordenadas: null,
    inicio: "2026-11-12T17:30:00-03:00",
    fin: "2026-11-12T19:00:00-03:00",
    imagenUrl: "https://api.colon.tur.ar/img/visita-molino.jpg",
    precio: 1500,
    estado: "programado",
  },
  {
    id: "evt-019",
    titulo: "Avistaje de Aves al Amanecer",
    descripcion:
      "Caminata guiada por los senderos de yatay para observar aves autóctonas y carpinchos en su hábitat natural. Traer calzado cómodo y agua.",
    lugarId: "lug-003",
    direccionLibre: null,
    coordenadas: null,
    inicio: "2026-11-13T07:30:00-03:00",
    fin: "2026-11-13T10:30:00-03:00",
    imagenUrl: null,
    precio: 0,
    estado: "suspendido",
  },
  {
    id: "evt-020",
    titulo: "Feria de Artesanos de la Costanera",
    descripcion:
      "Exposición y venta de artesanías en madera, cuero, cerámica, cuchillería y tejidos regionales a cielo abierto.",
    lugarId: null,
    direccionLibre: "Costanera Quirós y Gouchón (Anfiteatro)",
    coordenadas: { latitud: -32.2235, longitud: -58.1368 },
    inicio: "2026-11-14T18:00:00-03:00",
    fin: "2026-11-14T23:30:00-03:00",
    imagenUrl: "https://api.colon.tur.ar/img/feria-costanera.jpg",
    precio: 0,
    estado: "programado",
  },
  {
    id: "evt-021",
    titulo: "Concierto Acústico al Atardecer",
    descripcion:
      "Presentación de bandas acústicas locales frente al río Uruguay. Suspendido en caso de tormenta eléctrica.",
    lugarId: null,
    direccionLibre: "Explanada del Puerto Viejo",
    coordenadas: { latitud: -32.2198, longitud: -58.1355 },
    inicio: "2026-11-15T19:00:00-03:00",
    fin: null,
    imagenUrl: null,
    precio: null,
    estado: "cancelado",
  },
];
