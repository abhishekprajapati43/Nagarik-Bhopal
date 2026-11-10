import crypto from "node:crypto";
import fs from "node:fs";
import multer from "multer";
import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { env } from "../config/env.js";

fs.mkdirSync(env.uploads.directory, { recursive: true });

const EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, env.uploads.directory),
  filename: (_req, file, callback) => {
    const extension = EXTENSIONS[file.mimetype] || "";
    callback(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`);
  },
});

export const uploadImage = multer({
  storage,
  limits: { fileSize: env.uploads.maxBytes, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!env.uploads.allowedMimeTypes.includes(file.mimetype)) {
      return callback(
        new AppError(
          ERROR_CODES.UNSUPPORTED_MEDIA,
          "Only JPEG, PNG, WebP or GIF images can be uploaded."
        )
      );
    }

    return callback(null, true);
  },
}).single("file");

export default uploadImage;
