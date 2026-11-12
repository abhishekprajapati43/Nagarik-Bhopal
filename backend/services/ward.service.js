import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { ROLES } from "../../shared/constants.js";
import {
  emailAddress,
  oneOf,
  optionalText,
  phoneDigits,
  requiredText,
} from "../../shared/validation.js";
import { withTransaction } from "../config/database.js";
import * as wards from "../repositories/ward.repository.js";
import * as representatives from "../repositories/representative.repository.js";
import * as officers from "../repositories/officer.repository.js";
import * as audit from "../repositories/audit.repository.js";
import { requireAdmin } from "../utils/authz.js";
import { ward as serializeWard } from "../utils/serialize.js";

const ZONES = ["North", "South", "East", "West", "Central"];
const MAX_WARD_NUMBER = 200;
const MAX_ZONE_NUMBER = 30;

const optionalInteger = (value, field, min, max) => {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new AppError(
      ERROR_CODES.VALIDATION,
      `${field} must be a whole number between ${min} and ${max}.`
    );
  }
  return parsed;
};

const councillorMobile = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const digits = phoneDigits(text);
  if (digits.length !== 10) {
    throw new AppError(ERROR_CODES.VALIDATION, "Enter a valid 10-digit councillor mobile number.");
  }
  return digits;
};

const readPayload = (payload, existing = null) => {
  const name = requiredText(payload.wardName ?? payload.name, {
    field: "Ward name",
    min: 2,
    max: 80,
  });
  const area = requiredText(payload.area ?? name, { field: "Area", min: 2, max: 60 });
  const wardNumber = optionalInteger(
    payload.wardNumber ?? existing?.ward_number,
    "Ward number",
    1,
    MAX_WARD_NUMBER
  );
  const zoneNumber = optionalInteger(
    payload.zoneNumber ?? existing?.zone_number,
    "Zone number",
    1,
    MAX_ZONE_NUMBER
  );
  const zone = zoneNumber
    ? `Zone ${zoneNumber}`
    : oneOf(payload.zone || existing?.zone || "Central", ZONES, "zone");

  const center = Array.isArray(payload.center) && payload.center.length === 2
    ? payload.center.map(Number)
    : existing
      ? [Number(existing.center_lat), Number(existing.center_lng)]
      : null;

  if (!center || center.some((value) => !Number.isFinite(value))) {
    throw new AppError(ERROR_CODES.VALIDATION, "Ward coordinates are invalid.");
  }

  const [latitude, longitude] = center;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new AppError(ERROR_CODES.VALIDATION, "Ward coordinates are out of range.");
  }

  return {
    name,
    area,
    zone,
    zoneNumber,
    wardNumber,
    assemblyConstituency: optionalText(payload.assemblyConstituency, {
      field: "Assembly constituency",
      max: 80,
    }),
    councillorName: optionalText(payload.councillorName, {
      field: "Councillor name",
      max: 80,
    }),
    councillorMobile: councillorMobile(payload.councillorMobile),
    population: optionalInteger(payload.population, "Population", 0, 10_000_000),
    center: [latitude, longitude],
    officeAddress: optionalText(payload.officeAddress, {
      field: "Office address",
      max: 200,
    }),
    email: payload.email ? emailAddress(payload.email) : "",
    mlaName: optionalText(payload.mlaName, { field: "MLA name", max: 80 }),
  };
};

export const list = async (actor, query = {}) => {
  const isAdmin = actor?.role === ROLES.ADMIN;
  const rows = await wards.list({
    search: query.search || "",
    wardNumber: query.wardNumber || "",
    zoneNumber: query.zoneNumber || "",
    assemblyConstituency: query.assemblyConstituency || "",
    assignedOfficerId: query.assignedOfficerId || "",
    unassignedOfficer: Boolean(query.unassignedOfficer),
  });

  return {
    items: rows.map((row) => serializeWard({ ...row, assigned: isAdmin })),
    total: rows.length,
  };
};

export const get = async (actor, id) => {
  const row = await wards.findById(String(id || ""));
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, "That ward could not be found.");

  const isAdmin = actor?.role === ROLES.ADMIN;
  return { ward: serializeWard({ ...row, assigned: isAdmin }) };
};

export const save = async (actor, payload = {}, context = {}) => {
  requireAdmin(actor);

  const existing = payload.id ? await wards.findRowById(String(payload.id)) : null;
  if (payload.id && !existing) {
    throw new AppError(ERROR_CODES.NOT_FOUND, "That ward could not be found.");
  }

  const data = readPayload(payload, existing);

  if (data.wardNumber) {
    const duplicate = await wards.findByNumber(data.wardNumber);
    if (duplicate && duplicate.id !== existing?.id) {
      throw new AppError(ERROR_CODES.CONFLICT, "A ward with that number already exists.");
    }
  }

  const sameName = await wards.findByName(data.name);
  if (sameName && sameName.id !== existing?.id) {
    throw new AppError(ERROR_CODES.CONFLICT, "A ward with that name already exists.");
  }

  let person = null;
  if (payload.representativeId) {
    person = await representatives.findRowById(String(payload.representativeId));
    if (!person) {
      throw new AppError(ERROR_CODES.VALIDATION, "Choose a valid representative.");
    }
  }

  let officer = null;
  if (payload.assignedOfficerId) {
    officer = await officers.findById(String(payload.assignedOfficerId));
    if (!officer || officer.is_active === false) {
      throw new AppError(ERROR_CODES.VALIDATION, "Choose an active sanitation officer.");
    }
  }

  const saved = await withTransaction(async (client) => {
    // The representative record is an optional satellite: it stores office
    // address, email and MLA name, while the ward stays the primary source for
    // the councillor's name and mobile number.
    let representativeId = person?.id || existing?.representative_id || "";
    const wantsRepresentative = Boolean(
      person || data.officeAddress || data.email || data.mlaName
    );

    if (wantsRepresentative) {
      if (representativeId) {
        await client.query(
          `UPDATE representatives
           SET name = $2, phone = $3, designation = 'Ward Corporator',
               email = $4, mla_name = $5, office_address = $6
           WHERE id = $1`,
          [
            representativeId,
            data.councillorName || person?.name || data.name,
            data.councillorMobile || person?.phone || "",
            data.email || person?.email || "",
            data.mlaName,
            data.officeAddress,
          ]
        );
      } else {
        const created = await client.query(
          `INSERT INTO representatives
             (name, designation, phone, email, mla_name, office_address, ward_id)
           VALUES ($1, 'Ward Corporator', $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            data.councillorName || data.name,
            data.councillorMobile,
            data.email,
            data.mlaName,
            data.officeAddress,
            existing?.id || null,
          ]
        );
        representativeId = created.rows[0].id;
      }
    }

    const ward = {
      ...data,
      representativeId,
      assignedOfficerId: officer?.id || (payload.assignedOfficerId === "" ? "" : existing?.assigned_officer_id || ""),
      isDefault: existing?.is_default || Boolean(payload.isDefault),
    };

    let record;
    if (existing) {
      record = await wards.update(existing.id, ward, client);
    } else {
      record = await wards.create(ward, client);
    }

    // Keep the representative's own ward pointer in step with the ward row.
    await client.query(
      "UPDATE representatives SET ward_id = NULL WHERE ward_id = $1 AND id <> $2",
      [record.id, representativeId || ""]
    );

    if (representativeId) {
      await client.query("UPDATE representatives SET ward_id = $1 WHERE id = $2", [
        record.id,
        representativeId,
      ]);
    }

    return record;
  });

  await audit.record({
    actorId: actor.id,
    action: existing ? "admin.ward_updated" : "admin.ward_created",
    entity: "ward",
    entityId: saved.id,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: {
      wardNumber: saved.ward_number,
      zoneNumber: saved.zone_number,
      assemblyConstituency: saved.assembly_constituency,
    },
  });

  const row = await wards.findById(saved.id);

  return {
    ward: serializeWard({ ...row, assigned: true }),
    message: existing ? "Ward updated." : "Ward created.",
  };
};

/** Quick assignment used by the ward console and the pending queue. */
export const assign = async (actor, id, payload = {}, context = {}) => {
  requireAdmin(actor);

  const existing = await wards.findRowById(id);
  if (!existing) throw new AppError(ERROR_CODES.NOT_FOUND, "That ward could not be found.");

  let officer = null;
  if (payload.officerId) {
    officer = await officers.findById(String(payload.officerId));
    if (!officer || officer.is_active === false) {
      throw new AppError(ERROR_CODES.VALIDATION, "Choose an active sanitation officer.");
    }
  }

  let person = null;
  if (payload.representativeId) {
    person = await representatives.findRowById(String(payload.representativeId));
    if (!person) {
      throw new AppError(ERROR_CODES.VALIDATION, "Choose a valid representative.");
    }
  }

  const saved = await withTransaction(async (client) => {
    const record = await wards.assign(
      id,
      {
        officerId: officer?.id || "",
        representativeId: person?.id || existing.representative_id || "",
      },
      client
    );

    if (person) {
      await client.query("UPDATE representatives SET ward_id = $1 WHERE id = $2", [
        id,
        person.id,
      ]);
    }

    return record;
  });

  await audit.record({
    actorId: actor.id,
    action: "admin.ward_assigned",
    entity: "ward",
    entityId: id,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: {
      officerId: officer?.id || "",
      representativeId: person?.id || "",
    },
  });

  const row = await wards.findById(saved.id);
  return {
    ward: serializeWard({ ...row, assigned: true }),
    message: officer
      ? `Complaints from ${saved.name} will now be routed to ${officer.name || officer.employee_code}.`
      : `Ward ${saved.name} has no sanitation officer. New complaints wait in the admin queue.`,
  };
};

export const remove = async (actor, id, context = {}) => {
  requireAdmin(actor);

  const existing = await wards.findRowById(id);
  if (!existing) throw new AppError(ERROR_CODES.NOT_FOUND, "That ward could not be found.");

  if (existing.is_default) {
    throw new AppError(
      ERROR_CODES.CONFLICT,
      "Default BMC wards cannot be deleted. Edit the ward instead."
    );
  }

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

/**
 * Public ward-level heat data. Counts are capped to what the map needs so no
 * resident identity or complaint detail leaks through this endpoint.
 */
export const heatmap = async () => {
  const rows = await wards.wardStats();

  return {
    items: rows.map((row) => ({
      id: row.id,
      wardNumber: row.ward_number,
      wardName: row.name,
      area: row.area,
      zoneNumber: row.zone_number,
      center: [Number(row.center_lat), Number(row.center_lng)],
      total: row.total,
      pending: row.pending,
      resolved: row.resolved,
    })),
    updatedAt: new Date().toISOString(),
  };
};
