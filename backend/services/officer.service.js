import { requireAdmin, requireOfficer } from "../utils/authz.js";
import { officer as serializeOfficer } from "../utils/serialize.js";
import * as officers from "../repositories/officer.repository.js";

/** Administrator directory used by the complaint assignment screen. */
export const list = async (actor) => {
  requireAdmin(actor);
  const rows = await officers.listActive();
  return { items: rows.map(serializeOfficer) };
};

/** The signed-in officer's own profile. */
export const profile = async (actor) => {
  requireOfficer(actor);
  const row = await officers.findByUserId(actor.id);
  const detail = row ? await officers.findById(row.id) : null;
  return { officer: detail ? serializeOfficer(detail) : null };
};

export default { list, profile };
