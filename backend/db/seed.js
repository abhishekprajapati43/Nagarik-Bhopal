import { buildSeed } from "../../shared/seed.js";
import { hashPassword } from "../../shared/password.js";
import { DEFAULT_SETTINGS, ROLES, USER_STATUS } from "../../shared/constants.js";
import { pool, withTransaction } from "../config/database.js";
import { logger } from "../utils/logger.js";

const DAY = 86_400_000;

/**
 * Two extra demo residents so seeded comments and upvotes belong to real
 * accounts, and the admin user list has more than one row to show.
 */
const EXTRA_RESIDENTS = [
  {
    id: "u-public-1",
    name: "Rahul Mehta",
    email: "rahul@nagarik.bhopal",
    phone: "+91 90000 11111",
    wardId: "ward-35",
  },
  {
    id: "u-public-2",
    name: "Ankit Jain",
    email: "ankit@nagarik.bhopal",
    phone: "+91 90000 22222",
    wardId: "ward-12",
  },
];

export async function ensureSettings() {
  await pool.query(
    `INSERT INTO app_settings (id, value)
     VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(DEFAULT_SETTINGS)]
  );
}

const insertUser = (client, user) =>
  client.query(
    `INSERT INTO users (id, name, email, phone, ward_id, role, status, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
     ON CONFLICT (id) DO NOTHING`,
    [
      user.id,
      user.name,
      user.email,
      user.phone || "",
      user.wardId || null,
      user.role,
      user.status,
      user.passwordHash,
      user.createdAt,
    ]
  );

/**
 * Create the first-run dataset. Safe to call on every boot: it does nothing
 * when at least one account already exists, and settings default only fill
 * an empty row.
 */
export async function seed() {
  await ensureSettings();

  const existing = await pool.query("SELECT count(*)::int AS count FROM users");
  if (existing.rows[0].count > 0) {
    logger.debug("Database already seeded", { users: existing.rows[0].count });
    return { seeded: false };
  }

  const iso = (offsetDays) => new Date(Date.now() - offsetDays * DAY).toISOString();
  const seedData = await buildSeed({ hashPassword });
  const residentPassword = await hashPassword("Citizen@123");
  const residents = EXTRA_RESIDENTS.map((person) => ({
    ...person,
    role: ROLES.USER,
    status: USER_STATUS.ACTIVE,
    passwordHash: residentPassword,
    createdAt: iso(30),
  }));

  await withTransaction(async (client) => {
    for (const ward of seedData.wards) {
      await client.query(
        `INSERT INTO wards (id, name, area, zone, center_lat, center_lng)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [ward.id, ward.name, ward.area, ward.zone, ward.center[0], ward.center[1]]
      );
    }

    for (const person of seedData.representatives) {
      await client.query(
        `INSERT INTO representatives (id, name, designation, phone, email, ward_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [person.id, person.name, person.designation, person.phone, person.email, person.wardId]
      );
    }

    for (const ward of seedData.wards) {
      if (!ward.representativeId) continue;
      await client.query("UPDATE wards SET representative_id = $1 WHERE id = $2", [
        ward.representativeId,
        ward.id,
      ]);
    }

    for (const user of [...seedData.users, ...residents]) {
      await insertUser(client, user);
    }

    for (const complaint of seedData.complaints) {
      const [latitude, longitude] = complaint.position || [null, null];

      await client.query(
        `INSERT INTO complaints
           (id, user_id, waste_type, description, address, ward_id, representative_id,
            status, priority, image, latitude, longitude, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (id) DO NOTHING`,
        [
          complaint.id,
          complaint.userId,
          complaint.wasteType,
          complaint.description,
          complaint.address,
          complaint.wardId || null,
          complaint.representativeId || null,
          complaint.status,
          complaint.priority,
          complaint.image || "",
          latitude,
          longitude,
          complaint.createdAt,
          complaint.updatedAt,
        ]
      );

      for (const entry of complaint.timeline || []) {
        await client.query(
          `INSERT INTO complaint_timeline (complaint_id, status, note, actor_name, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [complaint.id, entry.status, entry.note || "", entry.by || "System", entry.at]
        );
      }

      for (const comment of complaint.comments || []) {
        await client.query(
          `INSERT INTO complaint_comments (id, complaint_id, user_id, body, created_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO NOTHING`,
          [comment.id, complaint.id, comment.userId, comment.text, comment.createdAt]
        );
      }

      const voters = residents
        .filter((person) => person.id !== complaint.userId)
        .slice(0, Math.min(Number(complaint.upvotedBy?.length || 0), residents.length));

      for (const voter of voters) {
        await client.query(
          `INSERT INTO complaint_upvotes (complaint_id, user_id, created_at)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [complaint.id, voter.id, complaint.createdAt]
        );
      }
    }

    for (const notification of seedData.notifications) {
      await client.query(
        `INSERT INTO notifications (id, user_id, title, body, type, complaint_id, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [
          notification.id,
          notification.userId,
          notification.title,
          notification.body,
          notification.type,
          notification.complaintId || null,
          Boolean(notification.read),
          notification.createdAt,
        ]
      );
    }
  });

  logger.info("Database seeded", {
    users: seedData.users.length + residents.length,
    complaints: seedData.complaints.length,
    wards: seedData.wards.length,
    representatives: seedData.representatives.length,
  });

  return { seeded: true };
}

export default seed;
