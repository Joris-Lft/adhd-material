import imageCompression from "browser-image-compression";
// Script du worker hébergé par nos soins (UMD, chargé via importScripts) : sans cela la bibliothèque
// le télécharge depuis cdn.jsdelivr.net.
import libURL from "browser-image-compression/dist/browser-image-compression.js?url";
import { photoFormatMessage, photoTooHeavyMessage, photoUnreadableMessage } from "@/lib/messages";

export const MAX_PHOTOS = 3;
/** Plafond du bucket côté serveur. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Types acceptés et extension (minuscules) du chemin de stockage correspondant. */
const PHOTO_EXTENSIONS: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** Photo prête à l'envoi (déjà compressée). */
export interface PhotoItem {
  id: string;
  file: File;
}

export class PhotoError extends Error {}

export function photoExtension(type: string): string | undefined {
  return PHOTO_EXTENSIONS[type];
}

export function isSupportedPhoto(file: Blob): boolean {
  return photoExtension(file.type) !== undefined;
}

/** Redimensionne (1600 px) et convertit en WebP (cible 1 Mo) ; refuse ce qui reste trop lourd. */
export async function compressPhoto(file: File): Promise<File> {
  let compressed: File;
  try {
    compressed = await imageCompression(file, {
      maxSizeMB: 1,
      maxWidthOrHeight: 1600,
      useWebWorker: true,
      fileType: "image/webp",
      // Le worker est un blob: : l'URL du script doit être absolue.
      libURL: new URL(libURL, location.origin).href,
    });
  } catch {
    throw new PhotoError(photoUnreadableMessage(file.name));
  }
  // La bibliothèque peut renvoyer le fichier d'origine sans conversion : on s'en tient à son type réel.
  if (!isSupportedPhoto(compressed)) throw new PhotoError(photoFormatMessage(file.name));
  if (compressed.size > MAX_PHOTO_BYTES) throw new PhotoError(photoTooHeavyMessage(file.name));
  return compressed;
}
