import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeDatabase, withTransaction } from "../config/database.js";
import { logger } from "../utils/logger.js";

/**
 * Ward master importer.
 *
 *   npm run db:import-wards
 *   npm run db:import-wards -- path/to/wards.json
 *   npm run db:import-wards -- path/to/wards.csv
 *
 * The file may be a JSON array, a `{ "wards": [...] }` object, or a CSV with a
 * header row. Rows are matched by ward number first and then by ward name, so
 * the legacy demo rows keep their IDs, complaint links and officer assignments.
 * Imported rows are flagged `is_default`, which protects the official BMC ward
 * list from deletion in the admin console.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.join(HERE, "data", "bhopal-wards.json");

const NUMBER_KEYS = ["wardNumber", "ward_number", "wardNo", "ward_no", "ward"];
const NAME_KEYS = ["wardName", "ward_name", "name"];
const AREA_KEYS = ["area", "mainArea", "main_area", "locality"];
const ZONE_NUMBER_KEYS = ["zoneNumber", "zone_number", "zoneNo", "zone_no"];
const AC_KEYS = ["assemblyConstituency", "assembly_constituency", "constituency", "ac"];
const COUNCILLOR_KEYS = ["councillorName", "councillor_name", "corporator", "councillor"];
const MOBILE_KEYS = ["councillorMobile", "councillor_mobile", "mobile", "phone"];
const POPULATION_KEYS = ["population", "population2011"];
const OFFICE_KEYS = ["officeAddress", "office_address", "office"];
const EMAIL_KEYS = ["email", "representativeEmail", "representative_email"];
const MLA_KEYS = ["mlaName", "mla_name", "mla"];

const normaliseHeader = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const pick = (row, keys) => {
  for (const key of keys) {
    const value = row[normaliseHeader(key)];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
};

const normaliseRow = (row) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normaliseHeader(key), value])
  );

/** Minimal RFC-4180-ish CSV parser: enough for the BMC spreadsheets. */
export const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [header = [], ...body] = rows.filter((line) => line.some((cell) => cell.trim() !== ""));
  const keys = header.map((key) => key.trim());

  return body.map((line) =>
    Object.fromEntries(keys.map((key, index) => [key, (line[index] || "").trim()]))
  );
};

const centreOf = (row) => {
  if (Array.isArray(row.center) && row.center.length === 2) {
    return row.center.map(Number);
  }

  if (typeof row.center === "string" && row.center.includes(",")) {
    return row.center.split(",").map((value) => Number(value.trim()));
  }

  const latitude = Number(pick(row, ["latitude", "lat", "centerLat", "center_lat"]));
  const longitude = Number(pick(row, ["longitude", "lng", "lon", "centerLng", "center_lng"]));

  return [latitude, longitude];
};

const mobileOf = (value) => {
  const digits = String(value || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
};

export const readWardFile = async (file) => {
  const text = await fs.readFile(file, "utf8");
  const extension = path.extname(file).toLowerCase();

  if (extension === ".csv") return parseCsv(text);

  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.wards)) return parsed.wards;

  throw new Error("Ward file must be a JSON array, { wards: [...] } or a CSV file.");
};

export const normaliseWard = (input, index) => {
  const row = normaliseRow(input);
  const wardNumber = Number(pick(row, NUMBER_KEYS));
  const wardName = pick(row, NAME_KEYS);
  const zoneNumberRaw = pick(row, ZONE_NUMBER_KEYS);
  const zoneNumber = zoneNumberRaw ? Number(zoneNumberRaw.replace(/[^0-9]/g, "")) : null;
  const centre = centreOf(row).map(Number);
  const where = `row ${index + 1}${wardName ? ` (${wardName})` : ""}`;

  if (!Number.isInteger(wardNumber) || wardNumber < 1 || wardNumber > 200) {
    throw new Error(`${where}: ward number must be an integer between 1 and 200.`);
  }

  if (wardName.length < 2 || wardName.length > 80) {
    throw new Error(`${where}: ward name must be 2–80 characters.`);
  }

  if (centre.length !== 2 || centre.some((value) => !Number.isFinite(value))) {
    throw new Error(`${where}: latitude/longitude are missing or invalid.`);
  }

  const [latitude, longitude] = centre;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error(`${where}: latitude/longitude are out of range.`);
  }

  const zone = zoneNumber
    ? `Zone ${zoneNumber}`
    : pick(row, ["zone"]) || "Central";

  return {
    wardNumber,
    wardName,
    area: pick(row, AREA_KEYS) || wardName,
    zone,
    zoneNumber: Number.isInteger(zoneNumber) ? zoneNumber : null,
    assemblyConstituency: pick(row, AC_KEYS),
    councillorName: pick(row, COUNCILLOR_KEYS),
    councillorMobile: mobileOf(pick(row, MOBILE_KEYS)),
    population: Number(pick(row, POPULATION_KEYS)) || null,
    officeAddress: pick(row, OFFICE_KEYS),
    email: pick(row, EMAIL_KEYS),
    mlaName: pick(row, MLA_KEYS),
    centre: [latitude, longitude],
  };
};

/**
 * Upsert a validated ward list. Exported so the one-off data task and the CLI
 * share exactly the same behaviour.
 */
export async function importWards(file = DEFAULT_FILE) {
  const rows = (await readWardFile(file)).map(normaliseWard);

  const seenNumbers = new Set();
  const seenNames = new Set();

  for (const row of rows) {
    if (seenNumbers.has(row.wardNumber)) {
      throw new Error(`Duplicate ward number ${row.wardNumber} in ${file}.`);
    }
    if (seenNames.has(row.wardName.toLowerCase())) {
      throw new Error(`Duplicate ward name "${row.wardName}" in ${file}.`);
    }
    seenNumbers.add(row.wardNumber);
    seenNames.add(row.wardName.toLowerCase());
  }

  return withTransaction(async (client) => {
    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      const found = await client.query(
        `SELECT * FROM wards
         WHERE ward_number = $1 OR lower(name) = lower($2)
         ORDER BY (ward_number = $1) DESC
         LIMIT 1`,
        [row.wardNumber, row.wardName]
      );

      let id;

      if (found.rows[0]) {
        id = found.rows[0].id;
        await client.query(
          `UPDATE wards
           SET ward_number = $2, name = $3, area = $4, zone = $5, zone_number = $6,
               assembly_constituency = $7, councillor_name = $8, councillor_mobile = $9,
               population = $10, center_lat = $11, center_lng = $12, is_default = true
           WHERE id = $1`,
          [
            id,
            row.wardNumber,
            row.wardName,
            row.area,
            row.zone,
            row.zoneNumber,
            row.assemblyConstituency,
            row.councillorName,
            row.councillorMobile,
            row.population,
            row.centre[0],
            row.centre[1],
          ]
        );
        updated += 1;
      } else {
        const created = await client.query(
          `INSERT INTO wards (
             ward_number, name, area, zone, zone_number, assembly_constituency,
             councillor_name, councillor_mobile, population, center_lat, center_lng, is_default
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
           RETURNING id`,
          [
            row.wardNumber,
            row.wardName,
            row.area,
            row.zone,
            row.zoneNumber,
            row.assemblyConstituency,
            row.councillorName,
            row.councillorMobile,
            row.population,
            row.centre[0],
            row.centre[1],
          ]
        );
        id = created.rows[0].id;
        inserted += 1;
      }

      // The ward master is the primary source for the councillor. The optional
      // representative row only carries office address, email and MLA name; it
      // is never renamed or re-pointed by an import.
      if (
        found.rows[0]?.representative_id &&
        (row.officeAddress || row.email || row.mlaName)
      ) {
        await client.query(
          `UPDATE representatives
           SET office_address = CASE WHEN $2 = '' THEN office_address ELSE $2 END,
               email = CASE WHEN $3 = '' THEN email ELSE $3 END,
               mla_name = CASE WHEN $4 = '' THEN mla_name ELSE $4 END
           WHERE id = $1`,
          [
            found.rows[0].representative_id,
            row.officeAddress,
            row.email,
            row.mlaName,
          ]
        );
      } else if (
        !found.rows[0]?.representative_id &&
        (row.officeAddress || row.email || row.mlaName)
      ) {
        const person = await client.query(
          `INSERT INTO representatives
             (name, designation, phone, email, mla_name, office_address, ward_id)
           VALUES ($1, 'Ward Corporator', $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            row.councillorName || "Ward Corporator",
            row.councillorMobile,
            row.email,
            row.mlaName,
            row.officeAddress,
            id,
          ]
        );
        await client.query("UPDATE wards SET representative_id = $1 WHERE id = $2", [
          person.rows[0].id,
          id,
        ]);
      }
    }

    return { total: rows.length, inserted, updated };
  });
}

const main = async () => {
  const file = path.resolve(process.argv[2] || DEFAULT_FILE);
  logger.info("Importing ward master data", { file });
  const result = await importWards(file);
  logger.info("Ward master import finished", result);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .catch((error) => {
      logger.error("Ward master import failed", { error: error.message });
      process.exitCode = 1;
    })
    .finally(() => closeDatabase().catch(() => {}));
}
