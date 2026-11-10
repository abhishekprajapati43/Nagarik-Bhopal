import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { ROLES } from "../../shared/constants.js";
import { oneOf, requiredText } from "../../shared/validation.js";
import { withTransaction } from "../config/database.js";
import * as wards from "../repositories/ward.repository.js";
import * as representatives from "../repositories/representative.repository.js";
import * as audit from "../repositories/audit.repository.js";
import { requireAdmin } from "../utils/authz.js";
import { ward as serializeWard } from "../utils/serialize.js";

const ZONES = ["North", "South", "East", "West", "Central"];

export const list = async (actor) => {
  const rows = await wards.list();
  const isAdmin = actor?.role === ROLES.ADMIN;

  return {
    items: rows.map((row) => serializeWard({ ...row, assigned: isAdmin })),
  };
};

export const save = async (actor, payload = {}, context = {}) => {
  requireAdmin(actor);

  const name = requiredText(payload.name, { field: "Ward name", min: 2, max: 40 });
  const area = requiredText(payload.area, { field: "Area", min: 2, max: 60 });
  const zone = oneOf(payload.zone || "Central", ZONES, "zone");

  const center = Array.isArray(payload.center) && payload.center.length === 2
    ? payload.center.map(Number)
    : null;

  if (!center || center.some((value) => !Number.isFinite(value))) {
    throw new AppError(ERROR_CODES.VALIDATION, "Ward coordinates are invalid.");
  }

  const [latitude, longitude] = center;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new AppError(ERROR_CODES.VALIDATION, "Ward coordinates are out of range.");
  }

  const duplicate = await wards.findByName(name);
  if (duplicate && duplicate.id !== payload.id) {
    throw new AppError(ERROR_CODES.CONFLICT, "A ward with that name already exists.");
  }

  let person = null;
  if (payload.representativeId) {
    person = await representatives.findRowById(String(payload.representativeId));
    if (!person) {
      throw new AppError(ERROR_CODES.VALIDATION, "Choose a valid representative.");
    }
  }

  const ward = {
    name,
    area,
    zone,
    center: [latitude, longitude],
    representativeId: person?.id || "",
  };

  const saved = await withTransaction(async (client) => {
    let record;

    if (payload.id) {
      const existing = await wards.findRowById(String(payload.id), client);
      if (!existing) throw new AppError(ERROR_CODES.NOT_FOUND, "That ward could not be found.");
      record = await wards.update(existing.id, ward, client);
    } else {
      record = await wards.create(ward, client);
    }

    // Keep the representative's own ward pointer in step with the ward row.
    await client.query(
      "UPDATE representatives SET ward_id = NULL WHERE ward_id = $1 AND id <> $2",
      [record.id, person?.id || ""]
    );

    if (person) {
      await client.query("UPDATE representatives SET ward_id = $1 WHERE id = $2", [
        record.id,
        person.id,
      ]);
    }

    return record;
  });

  await audit.record({
    actorId: actor.id,
    action: payload.id ? "admin.ward_updated" : "admin.ward_created",
    entity: "ward",
    entityId: saved.id,
    ip: context.ip,
    userAgent: context.userAgent,
  });

  const row = await wards.findById(saved.id);

  return {
    ward: serializeWard({ ...row, assigned: true }),
    message: payload.id ? "Ward updated." : "Ward created.",
  };
};

export const remove = async (actor, id, context = {}) => {
  requireAdmin(actor);

  const existing = await wards.findRowById(id);
  if (!existing) throw new AppError(ERROR_CODES.NOT_FOUND, "That ward could not be found.");

  const assigned = await wards.countComplaints(id);
  if (assigned > 0) {
    throw new AppError(
      ERROR_CODES.CONFLICT,
      `This ward still has ${assigned} complaint(s). Reassign them before deleting it.`
    );
  }

  await withTransaction(async (client) => {
    await wards.clearAssignments(id, client);
    await wards.remove(id, client);
  });

  await audit.record({
    actorId: actor.id,
    action: "admin.ward_deleted",
    entity: "ward",
    entityId: id,
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return { message: "Ward removed." };
};
