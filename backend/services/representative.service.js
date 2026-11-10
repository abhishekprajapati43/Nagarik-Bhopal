import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { emailAddress, optionalText, phoneNumber, requiredText } from "../../shared/validation.js";
import * as representatives from "../repositories/representative.repository.js";
import * as wards from "../repositories/ward.repository.js";
import * as audit from "../repositories/audit.repository.js";
import { requireAdmin } from "../utils/authz.js";
import { representative as serializeRepresentative } from "../utils/serialize.js";

const readPayload = async (payload) => {
  const name = requiredText(payload.name, { field: "Name", min: 2, max: 80 });
  const designation =
    optionalText(payload.designation, { field: "Designation", max: 60 }) || "Ward Corporator";
  const phone = phoneNumber(payload.phone);
  const email = payload.email ? emailAddress(payload.email) : "";

  let wardId = "";
  if (payload.wardId) {
    const ward = await wards.findRowById(String(payload.wardId));
    if (!ward) throw new AppError(ERROR_CODES.VALIDATION, "Choose a valid ward.");
    wardId = ward.id;
  }

  return { name, designation, phone, email, wardId };
};

export const list = async () => {
  const rows = await representatives.list();
  return { items: rows.map(serializeRepresentative) };
};

export const save = async (actor, payload = {}, context = {}) => {
  requireAdmin(actor);

  const data = await readPayload(payload);
  const record = payload.id
    ? await representatives.update(String(payload.id), data)
    : await representatives.create(data);

  if (!record) throw new AppError(ERROR_CODES.NOT_FOUND, "That representative could not be found.");

  await audit.record({
    actorId: actor.id,
    action: payload.id ? "admin.representative_updated" : "admin.representative_created",
    entity: "representative",
    entityId: record.id,
    ip: context.ip,
    userAgent: context.userAgent,
  });

  const row = await representatives.findById(record.id);

  return {
    representative: serializeRepresentative(row),
    message: payload.id ? "Representative updated." : "Representative added.",
  };
};

export const remove = async (actor, id, context = {}) => {
  requireAdmin(actor);

  const existing = await representatives.findRowById(id);
  if (!existing) {
    throw new AppError(ERROR_CODES.NOT_FOUND, "That representative could not be found.");
  }

  await representatives.remove(id);

  await audit.record({
    actorId: actor.id,
    action: "admin.representative_deleted",
    entity: "representative",
    entityId: id,
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return { message: "Representative removed." };
};
