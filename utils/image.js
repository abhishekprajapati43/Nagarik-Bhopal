import { AppError, ERROR_CODES } from "../shared/errors";
import { MAX_IMAGE_BYTES } from "../shared/validation";

/**
 * Photos are stored as data URLs next to the complaint, so they are resized
 * before saving. That keeps a report well under the localStorage quota and
 * makes uploads far quicker on a phone connection.
 */

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new AppError(ERROR_CODES.VALIDATION, "That photo could not be read."));
    reader.readAsDataURL(file);
  });

const compress = (dataUrl, maxDimension, quality) =>
  new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
      const width = Math.round(image.width * scale);
      const height = Math.round(image.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) {
        resolve(dataUrl);
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };

    // SVG and other formats may not be drawable; keep the original then.
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });

export async function prepareImage(file, { maxDimension = 1280, quality = 0.72 } = {}) {
  if (!file) throw new AppError(ERROR_CODES.VALIDATION, "Choose a photo to attach.");
  if (!String(file.type).startsWith("image/")) {
    throw new AppError(ERROR_CODES.VALIDATION, "Only image files can be attached.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AppError(ERROR_CODES.VALIDATION, "That photo is larger than 12 MB. Please choose a smaller one.");
  }

  const dataUrl = await readAsDataUrl(file);
  const compressed = await compress(dataUrl, maxDimension, quality);

  if (compressed.length > MAX_IMAGE_BYTES) {
    throw new AppError(ERROR_CODES.VALIDATION, "That photo is still too large after resizing. Try another image.");
  }

  return compressed;
}
