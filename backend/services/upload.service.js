import fs from "node:fs/promises";
import path from "node:path";
import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { env } from "../config/env.js";
import * as uploads from "../repositories/upload.repository.js";
import * as audit from "../repositories/audit.repository.js";
import { isAdmin } from "../utils/authz.js";
import { upload as serializeUpload } from "../utils/serialize.js";

const readHead = async (filePath, length = 12) => {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

const signatureMatches = (head, mimeType) => {
  if (mimeType === "image/jpeg") {
    return head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  }

  if (mimeType === "image/png") {
    return (
      head.length >= 8 &&
      head[0] === 0x89 &&
      head[1] === 0x50 &&
      head[2] === 0x4e &&
      head[3] === 0x47 &&
      head[4] === 0x0d &&
      head[5] === 0x0a &&
      head[6] === 0x1a &&
      head[7] === 0x0a
    );
  }

  if (mimeType === "image/gif") {
    const signature = head.toString("ascii", 0, 6);
    return signature === "GIF87a" || signature === "GIF89a";
  }

  if (mimeType === "image/webp") {
    return (
      head.length >= 12 &&
      head.toString("ascii", 0, 4) === "RIFF" &&
      head.toString("ascii", 8, 12) === "WEBP"
    );
  }

  return false;
};

const removeFile = async (filename) => {
  const target = path.join(env.uploads.directory, path.basename(filename));
  await fs.unlink(target).catch(() => {});
};

export const store = async (actor, file, context = {}) => {
  if (!file) {
    throw new AppError(ERROR_CODES.VALIDATION, "Choose an image to upload.");
  }

  try {
    const head = await readHead(file.path);

    if (!signatureMatches(head, file.mimetype)) {
      await removeFile(file.filename);
      throw new AppError(ERROR_CODES.UNSUPPORTED_MEDIA, "That file is not a valid image.");
    }

    const record = await uploads.create({
      userId: actor.id,
      filename: file.filename,
      originalName: String(file.originalname || "").slice(0, 200),
      mimeType: file.mimetype,
      sizeBytes: file.size,
      url: `${env.uploads.publicPath}/${file.filename}`,
    });

    await audit.record({
      actorId: actor.id,
      action: "upload.created",
      entity: "upload",
      entityId: record.id,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { mimeType: record.mime_type, sizeBytes: record.size_bytes },
    });

    return { upload: serializeUpload(record) };
  } catch (error) {
    if (!(error instanceof AppError)) await removeFile(file.filename);
    throw error;
  }
};

export const remove = async (actor, id, context = {}) => {
  const record = await uploads.findById(id);
  if (!record) throw new AppError(ERROR_CODES.NOT_FOUND, "That upload could not be found.");

  if (record.user_id && record.user_id !== actor.id && !isAdmin(actor)) {
    throw new AppError(ERROR_CODES.FORBIDDEN, "You can only remove your own uploads.");
  }

  await uploads.remove(id);
  await removeFile(record.filename);

  await audit.record({
    actorId: actor.id,
    action: "upload.deleted",
    entity: "upload",
    entityId: id,
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return { message: "Image removed." };
};
