export type BrandImageFile = {
  mimeType: string;
  contentBase64: string;
};

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_STORED_BYTES = 180_000;

export async function fitBrandImage(file: File, kind: "logo" | "portrait"): Promise<BrandImageFile> {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    throw new Error("Use uma imagem JPG, PNG ou WebP.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("A imagem original passa de 8 MB. Escolha um arquivo menor.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Não foi possível ajustar esta imagem ao quadro.");
    }
    if (kind === "logo") {
      const scale = Math.min(640 / bitmap.width, 160 / bitmap.height, 1);
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const png = await canvasBlob(canvas, "image/png");
      if (png.size <= MAX_STORED_BYTES) {
        return { mimeType: "image/png", contentBase64: await blobToBase64(png) };
      }
      const jpeg = await canvasBlob(canvas, "image/jpeg", 0.85);
      if (jpeg.size > MAX_STORED_BYTES) {
        throw new Error("A logomarca ficou grande demais para o quadro. Use uma imagem mais simples.");
      }
      return { mimeType: "image/jpeg", contentBase64: await blobToBase64(jpeg) };
    }
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const scale = Math.max(size / bitmap.width, size / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
    let quality = 0.86;
    let jpeg = await canvasBlob(canvas, "image/jpeg", quality);
    while (jpeg.size > MAX_STORED_BYTES && quality > 0.5) {
      quality -= 0.12;
      jpeg = await canvasBlob(canvas, "image/jpeg", quality);
    }
    if (jpeg.size > MAX_STORED_BYTES) {
      throw new Error("A foto ficou grande demais para o quadro. Escolha outra imagem.");
    }
    return { mimeType: "image/jpeg", contentBase64: await blobToBase64(jpeg) };
  } finally {
    bitmap.close();
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Não foi possível ajustar esta imagem ao quadro."));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}
