// Guarda una copia persistente de la foto de una visita en el directorio de documentos del dispositivo
export async function guardarFotoVisitaLocal(
  uriOrigen: string,
  visitaId: string,
): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Directory, File, Paths } = require("expo-file-system") as typeof import("expo-file-system");
    const dirVisitas = new Directory(Paths.document, "visitas");
    if (!dirVisitas.exists) {
      dirVisitas.create({ idempotent: true, intermediates: true });
    }

    const archivoOrigen = new File(uriOrigen);
    const archivoDestino = new File(dirVisitas, `${visitaId}.jpg`);
    if (archivoDestino.exists) {
      archivoDestino.delete();
    }
    await archivoOrigen.copy(archivoDestino);
    return archivoDestino.uri;
  } catch {
    return uriOrigen;
  }
}

// Verifica si la audioguía de un lugar ya está descargada en el teléfono para escuchar sin señal (ej. El Palmar)
export function obtenerUriAudioguiaLocal(lugarId: string): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Directory, File, Paths } = require("expo-file-system") as typeof import("expo-file-system");
    const dirAudio = new Directory(Paths.document, "audioguias");
    const archivo = new File(dirAudio, `${lugarId}.m4a`);
    return archivo.exists ? archivo.uri : null;
  } catch {
    return null;
  }
}

// Descarga la audioguía al almacenamiento local usando la nueva API File/Directory/Paths de expo-file-system
export async function descargarAudioguiaLocal(
  lugarId: string,
  urlRemota: string,
): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Directory, File, Paths } = require("expo-file-system") as typeof import("expo-file-system");
    const dirAudio = new Directory(Paths.document, "audioguias");
    if (!dirAudio.exists) {
      dirAudio.create({ idempotent: true, intermediates: true });
    }
    const archivoDestino = new File(dirAudio, `${lugarId}.m4a`);
    const descargado = await File.downloadFileAsync(urlRemota, archivoDestino, {
      idempotent: true,
    });
    return descargado.uri;
  } catch {
    return urlRemota;
  }
}
