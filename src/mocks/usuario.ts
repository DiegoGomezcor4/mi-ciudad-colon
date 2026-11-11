import { Favorito, Usuario } from "../tipos";

export const USUARIO_MOCK: Usuario = {
  id: "usr-201",
  nombre: "Lucía Méndez",
  email: "lucia@mail.com",
  avatarUrl: null,
  creadoEn: "2026-09-02T18:20:00-03:00",
  preferencias: {
    categoriasFavoritas: ["cat-museos", "cat-playas"],
    avisarProximidad: true,
    radioAvisoMetros: 250,
    tema: "sistema",
  },
};

export const FAVORITOS_MOCK: Favorito[] = [
  {
    id: "fav-088",
    usuarioId: "usr-201",
    lugarId: "lug-004",
    creadoEn: "2026-11-10T09:05:00-03:00",
  },
  {
    id: "fav-089",
    usuarioId: "usr-201",
    lugarId: "lug-001",
    creadoEn: "2026-11-10T11:20:00-03:00",
  },
];
