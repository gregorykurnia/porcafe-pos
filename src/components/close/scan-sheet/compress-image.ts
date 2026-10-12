import { fitWithin } from "@/lib/scan-review";

// A 12 MP phone photo becomes a few hundred KB here. The request must stay well under
// the 4.5 MB limit on the hosting platform. Output is always JPEG, so HEIC photos from
// phones are sent as JPEG too.
const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.8;

export type PreparedPhoto = {
  base64: string;
  mediaType: "image/jpeg";
  blob: Blob;
};

export async function prepareSheetPhoto(file: File): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This device could not prepare the photo.");
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("This device could not prepare the photo."))),
        "image/jpeg",
        JPEG_QUALITY
      );
    });
    return { base64: await blobToBase64(blob), mediaType: "image/jpeg", blob };
  } finally {
    bitmap.close();
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the photo."));
    reader.readAsDataURL(blob);
  });
}
