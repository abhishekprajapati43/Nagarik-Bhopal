import { buildSeed } from "../../shared/seed.js";
import { hashPassword } from "../../shared/password.js";
import {
  DEFAULT_SETTINGS,
  DEMO_OFFICER,
  ROLES,
  USER_STATUS,
} from "../../shared/constants.js";
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
    aadhaarLast4: "5678",
  },
  {
    id: "u-public-2",
    name: "Ankit Jain",
    email: "ankit@nagarik.bhopal",
    phone: "+91 90000 22222",
    wardId: "ward-12",
    aadhaarLast4: "9012",
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
    `INSERT INTO users (
       id, name, email, phone, ward_id, role, status, password_hash,
       aadhaar_number, aadhaar_last4, aadhaar_hash, aadhaar_verified,
       aadhaar_verified_at, verification_status, verification_remarks,
       aadhaar_submitted_at, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17)
     ON CONFLICT (id) DO NOTHING`,
    [
      user.id,
      user.name,
      user.email || "",
      user.phone || "",
      user.wardId || null,
      user.role,
      user.status,
      user.passwordHash,
      user.aadhaarNumber || null,
      user.aadhaarLast4 || "",
      user.aadhaarHash || null,
      Boolean(user.aadhaarVerified),
      user.aadhaarVerifiedAt || null,
      user.verificationStatus || "Pending",
      user.verificationRemarks || "",
      user.aadhaarSubmittedAt || null,
      user.createdAt,
    ]
  );

const insertOfficer = (client, officer) =>
  client.query(
    `INSERT INTO officers (id, user_id, employee_code, designation, zone, phone, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
     ON CONFLICT DO NOTHING`,
    [
      officer.id,
      officer.userId,
      officer.employeeCode || "",
      officer.designation || "Sanitation Officer",
      officer.zone || "Central",
      officer.phone || "",
      officer.isActive !== false,
      officer.createdAt || new Date().toISOString(),
    ]
  );

/**
 * Fill MLA/office columns for the demo representatives on databases created
 * before those fields existed. Administrators' own edits are never overwritten.
 */
async function ensureRepresentativeDetails() {
  const demo = [
    ["rep-1", "Shri Rameshwar Sharma", "Ward Office, Zone-1, MP Nagar, Bhopal"],
    ["rep-2", "Smt. Aruna Verma", "Ward Office, Ashoka Garden, Bhopal"],
    ["rep-3", "Shri Salman Khan", "Ward Office, New Market, Bhopal"],
    ["rep-4", "Shri Mahesh Yadav", "Ward Office, Kolar Road, Bhopal"],
    ["rep-5", "Shri Govind Sahu", "Zone Office, Govindpura, Bhopal"],
  ];

  for (const [id, mlaName, officeAddress] of demo) {
    await pool.query(
      `UPDATE representatives
       SET mla_name = CASE WHEN mla_name = '' THEN $2 ELSE mla_name END,
           office_address = CASE WHEN office_address = '' THEN $3 ELSE office_address END
       WHERE id = $1`,
      [id, mlaName, officeAddress]
    ).catch(() => null);
  }
}

/**
 * Make sure the demo officer account still exists on databases that were
 * seeded before the officer feature shipped.
 */
async function ensureDemoOfficer() {
  const existing = await pool.query("SELECT * FROM users WHERE lower(email) = lower($1)", [
    DEMO_OFFICER.email,
  ]);

  let officerId = "officer-1";

  if (existing.rows[0]) {
    const user = existing.rows[0];
    await pool.query(
      `INSERT INTO officers (id, user_id, employee_code, designation, zone, phone, is_active)
       VALUES ($1, $2, $3, 'Sanitation Officer', $4, $5, true)
       ON CONFLICT DO NOTHING`,
      ["officer-1", user.id, DEMO_OFFICER.employeeCode, DEMO_OFFICER.zone, DEMO_OFFICER.phone]
    );
  } else {
    const passwordHash = await hashPassword(DEMO_OFFICER.password);

    await withTransaction(async (client) => {
      await insertUser(client, {
        id: "u-officer",
        name: DEMO_OFFICER.name,
        email: DEMO_OFFICER.email,
        phone: DEMO_OFFICER.phone,
        wardId: "ward-25",
        role: ROLES.OFFICER,
        status: USER_STATUS.ACTIVE,
        passwordHash,
        createdAt: new Date().toISOString(),
      });

      await insertOfficer(client, {
        id: "officer-1",
        userId: "u-officer",
        employeeCode: DEMO_OFFICER.employeeCode,
        designation: "Sanitation Officer",
        zone: DEMO_OFFICER.zone,
        phone: DEMO_OFFICER.phone,
        isActive: true,
      });
    });

    logger.info("Demo sanitation officer created", { email: DEMO_OFFICER.email });
  }

  // Give the demo wards a routed officer so automatic assignment is visible on
  // databases that predate ward routing. Existing assignments are never changed.
  const record = await pool.query(
    "SELECT id FROM officers WHERE lower(employee_code) = lower($1) OR id = $2 LIMIT 1",
    [DEMO_OFFICER.employeeCode, officerId]
  );

  officerId = record.rows[0]?.id || "";

  if (officerId) {
    await pool.query(
      `UPDATE wards SET assigned_officer_id = $1
       WHERE id = ANY($2::text[]) AND assigned_officer_id IS NULL`,
      [officerId, ["ward-25", "ward-35", "ward-40"]]
    );
  }
}

/**
 * Create the first-run dataset. Safe to call on every boot: it does nothing
 * when at least one account already exists, and settings default only fill
 * an empty row.
 */
export async function seed() {
  await ensureSettings();

  const existing = await pool.query("SELECT count(*)::int AS count FROM users");
  if (existing.rows[0].count > 0) {
    await ensureDemoOfficer();
    await ensureRepresentativeDetails();
    logger.debug("Database already seeded", { users: existing.rows[0].count });
    return { seeded: false };
  }

  const iso = (offsetDays) => new Date(Date.now() - offsetDays * DAY).toISOString();
  const seedData = await buildSeed({ hashPassword });
  const residentPassword = await hashPassword("Citizen@123");
  const adminName = seedData.users.find((user) => user.role === ROLES.ADMIN)?.name || "Administrator";
  const residents = EXTRA_RESIDENTS.map((person) => ({
    ...person,
    role: ROLES.USER,
    status: USER_STATUS.ACTIVE,
    passwordHash: residentPassword,
    aadhaarVerified: true,
    aadhaarVerifiedAt: iso(30),
    aadhaarSubmittedAt: iso(30),
    verificationStatus: "Verified",
    verificationRemarks: "Demo resident verified before the Aadhaar rollout.",
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
        `INSERT INTO representatives (id, name, designation, phone, email, mla_name, office_address, ward_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [
          person.id,
          person.name,
          person.designation,
          person.phone,
          person.email,
          person.mlaName || "",
          person.officeAddress || "",
          person.wardId,
        ]
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

    for (const officer of seedData.officers || []) {
      await insertOfficer(client, officer);
    }

    // Officers exist now, so the ward routing defaults can be linked safely.
    for (const ward of seedData.wards) {
      if (!ward.assignedOfficerId) continue;
      await client.query("UPDATE wards SET assigned_officer_id = $1 WHERE id = $2", [
        ward.assignedOfficerId,
        ward.id,
      ]);
    }

    for (const complaint of seedData.complaints) {
      const [latitude, longitude] = complaint.position || [null, null];

      await client.query(
        `INSERT INTO complaints
           (id, user_id, waste_type, complaint_category, complaint_type,
            description, address, ward_id, representative_id, assigned_officer_id,
            status, priority, image, before_photo, after_photo, work_notes,
            verification_status, latitude, longitude, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                 $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
         ON CONFLICT (id) DO NOTHING`,
        [
          complaint.id,
          complaint.userId,
          complaint.wasteType,
          complaint.complaintCategory,
          complaint.complaintType,
          complaint.description,
          complaint.address,
          complaint.wardId || null,
          complaint.representativeId || null,
          complaint.assignedOfficerId || null,
          complaint.status,
          complaint.priority,
          complaint.image || "",
          complaint.beforePhoto || "",
          complaint.afterPhoto || "",
          complaint.workNotes || "",
          complaint.verificationStatus || "not_requested",
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

        await client.query(
          `INSERT INTO status_history (complaint_id, from_status, to_status, note, actor_name, actor_role, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            complaint.id,
            "",
            entry.status,
            entry.note || "",
            entry.by || "System",
            entry.by === adminName ? ROLES.ADMIN : "",
            entry.at,
          ]
        );
      }

      if (complaint.assignedOfficerId) {
        await client.query(
          `INSERT INTO complaint_assignments (complaint_id, officer_id, assigned_by, note, assigned_at, active)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [
            complaint.id,
            complaint.assignedOfficerId,
            seedData.users.find((user) => user.role === ROLES.ADMIN)?.id || null,
            "Seeded assignment.",
            complaint.createdAt,
          ]
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
    officers: (seedData.officers || []).length,
  });

  return { seeded: true };
}

export default seed;
