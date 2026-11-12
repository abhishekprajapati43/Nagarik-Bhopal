import {
  COMPLAINT_CATEGORIES,
  AADHAAR_STATUS,
  AADHAAR_STATUS_LIST,
  DEFAULT_SETTINGS,
  DEMO_JWT_SECRET,
  EMAIL_TEMPLATES,
  GARBAGE_CATEGORY_ID,
  ROLES,
  STATUS,
  STATUS_LIST,
  TOKEN_TTL_SECONDS,
  USER_STATUS,
  VERIFICATION_STATUS,
  WARDS,
  WASTE_TYPES,
  complaintCategoryLabel,
  findCategoryForIssue,
  findComplaintCategory,
  findNearestWard,
} from "./constants.js";
import {
  aadhaarLast4,
  encryptAadhaar,
  hashAadhaar,
  maskAadhaar,
} from "./aadhaar.js";
import { AppError, ERROR_CODES } from "./errors.js";
import { signJwt, verifyJwt } from "./jwt.js";
import { hashPassword, verifyPassword } from "./password.js";
import { buildSeed } from "./seed.js";
import {
  aadhaarNumber as aadhaarRule,
  commentText,
  complaintPayload,
  emailAddress,
  loginIdentifier,
  mobileNumber,
  oneOf,
  optionalEmail,
  optionalText,
  password as validatePassword,
  phoneDigits,
  phoneNumber,
  photoValue,
  requiredText,
  statusValue,
  verificationDecision,
  workNotes as workNotesRule,
} from "./validation.js";

/**
 * The application's domain layer: authentication, complaints, wards,
 * representatives, notifications, analytics and settings.
 *
 * It is deliberately storage-agnostic. The browser passes a localStorage
 * adapter, the Express server passes a JSON-file adapter, and every rule
 * (validation, roles, status flow) lives here exactly once.
 */

const COLLECTIONS = {
  users: "users",
  officers: "officers",
  complaints: "complaints",
  wards: "wards",
  representatives: "representatives",
  notifications: "notifications",
  emails: "emails",
  settings: "settings",
  meta: "meta",
};

const DAY = 86_400_000;
const PAGE_SIZE = 12;

const uid = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const daysBetween = (from, to = Date.now()) =>
  Math.max(0, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / DAY));

const round = (value) => Math.round(value * 10) / 10;

export function createService(storage, { secret = DEMO_JWT_SECRET } = {}) {
  /* ------------------------------ storage ------------------------------ */

  const read = (key, fallback) => {
    const value = storage.get(key);
    if (value === null || value === undefined) return fallback;

    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  };

  const write = (key, value) => {
    try {
      storage.set(key, JSON.stringify(value));
    } catch {
      throw new AppError(
        ERROR_CODES.STORAGE,
        "This browser is out of storage space. Remove a photo or two and try again."
      );
    }
  };

  const users = () => read(COLLECTIONS.users, []);
  const officers = () => read(COLLECTIONS.officers, []);
  const complaints = () => read(COLLECTIONS.complaints, []);
  const wards = () => read(COLLECTIONS.wards, WARDS);
  const representatives = () => read(COLLECTIONS.representatives, []);
  const notifications = () => read(COLLECTIONS.notifications, []);
  const settings = () => ({ ...DEFAULT_SETTINGS, ...read(COLLECTIONS.settings, {}) });

  /* ------------------------------ seeding ------------------------------ */

  const ensureSeeded = async () => {
    const meta = read(COLLECTIONS.meta, null);

    if (meta?.seededAt) {
      // Browsers seeded before the officer feature keep their data; only add
      // the missing officer account and directory record. Accounts that
      // predate Aadhaar are grandfathered as verified, exactly like migration
      // 005 does for the API database.
      const userList = users();
      let changed = false;

      for (let index = 0; index < userList.length; index += 1) {
        const person = userList[index];

        if (person.role !== ROLES.USER || person.verificationStatus) continue;

        userList[index] = {
          ...person,
          aadhaarLast4: person.aadhaarLast4 || "1234",
          aadhaarVerified: true,
          aadhaarVerifiedAt: person.aadhaarVerifiedAt || person.createdAt || new Date().toISOString(),
          aadhaarSubmittedAt: person.aadhaarSubmittedAt || person.createdAt || null,
          verificationStatus: AADHAAR_STATUS.VERIFIED,
          verificationRemarks:
            person.verificationRemarks || "Existing account verified before the Aadhaar rollout.",
        };
        changed = true;
      }

      if (!read(COLLECTIONS.officers, []).length) {
        const seed = await buildSeed({ hashPassword });
        const officerUser = seed.users.find((user) => user.role === ROLES.OFFICER);

        if (officerUser && !userList.some((user) => user.email === officerUser.email)) {
          userList.push(officerUser);
          changed = true;
        }
        write(COLLECTIONS.officers, seed.officers || []);
      }

      if (changed) write(COLLECTIONS.users, userList);
      return;
    }

    const seed = await buildSeed({ hashPassword });

    write(COLLECTIONS.users, seed.users);
    write(COLLECTIONS.officers, seed.officers || []);
    write(COLLECTIONS.wards, seed.wards);
    write(COLLECTIONS.representatives, seed.representatives);
    write(COLLECTIONS.complaints, seed.complaints);
    write(COLLECTIONS.notifications, seed.notifications);
    write(COLLECTIONS.settings, seed.settings);
    write(COLLECTIONS.meta, seed.meta);
  };

  /* ------------------------------ helpers ------------------------------ */

  const toPublicUser = (user) => {
    const last4 = user.aadhaarLast4 || "";

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      wardId: user.wardId || "",
      role: user.role,
      status: user.status,
      // Encrypted Aadhaar and the lookup hash never leave the store.
      aadhaarLast4: last4,
      aadhaarMasked: maskAadhaar(last4),
      aadhaarVerified: Boolean(user.aadhaarVerified),
      aadhaarVerifiedAt: user.aadhaarVerifiedAt || null,
      aadhaarSubmittedAt: user.aadhaarSubmittedAt || null,
      verificationStatus: user.verificationStatus || AADHAAR_STATUS.PENDING,
      verificationRemarks: user.verificationRemarks || "",
      createdAt: user.createdAt,
    };
  };

  const authenticate = async (token) => {
    const payload = await verifyJwt(token, secret);
    const user = users().find((person) => person.id === payload.sub);

    if (!user) {
      throw new AppError(ERROR_CODES.UNAUTHENTICATED, "Your session is invalid. Please sign in again.");
    }

    if (user.status === USER_STATUS.BLOCKED) {
      throw new AppError(ERROR_CODES.BLOCKED, "This account has been blocked. Contact the city office.");
    }

    return user;
  };

  const requireUser = (actor) => {
    if (!actor) throw new AppError(ERROR_CODES.UNAUTHENTICATED, "Please sign in to continue.");
    return actor;
  };

  const requireAdmin = (actor) => {
    requireUser(actor);
    if (actor.role !== ROLES.ADMIN) {
      throw new AppError(ERROR_CODES.FORBIDDEN, "Only city administrators can perform this action.");
    }
    return actor;
  };

  const requireOfficer = (actor) => {
    requireUser(actor);
    if (actor.role !== ROLES.OFFICER) {
      throw new AppError(ERROR_CODES.FORBIDDEN, "Sanitation officer access is required.");
    }
    return actor;
  };

  const officerFor = (actor) => {
    requireOfficer(actor);
    const record = officers().find((officer) => officer.userId === actor.id && officer.isActive !== false);
    if (!record) {
      throw new AppError(
        ERROR_CODES.FORBIDDEN,
        "Your officer profile is not active. Contact the city administrator."
      );
    }
    return record;
  };

  const issueToken = (user) =>
    signJwt(
      { sub: user.id, role: user.role, name: user.name, email: user.email },
      secret,
      TOKEN_TTL_SECONDS[user.role] ?? TOKEN_TTL_SECONDS[ROLES.USER]
    );

  const findComplaint = (id) => {
    const complaint = complaints().find((item) => String(item.id) === String(id));
    if (!complaint) {
      throw new AppError(ERROR_CODES.NOT_FOUND, `Complaint #${id} could not be found.`);
    }
    return complaint;
  };

  const wardName = (wardId) => wards().find((ward) => ward.id === wardId)?.name || "Unassigned";

  const representativeName = (representativeId) =>
    representatives().find((person) => person.id === representativeId)?.name || "Not assigned";

  const officerRecord = (officerId) =>
    officers().find((officer) => officer.id === officerId) || null;

  const officerName = (officerId) => {
    const officer = officerRecord(officerId);
    if (!officer) return "";
    return users().find((person) => person.id === officer.userId)?.name || "Officer";
  };

  /**
   * Resolve the civic category for legacy and new records alike. Records
   * stored before the category rollout only have `wasteType`, which is treated
   * as a garbage complaint so nothing disappears from lists or charts.
   */
  const complaintCategoryId = (complaint) => {
    const explicit = findComplaintCategory(complaint.complaintCategory);
    if (explicit) return explicit.id;

    const inferred =
      findCategoryForIssue(complaint.complaintType) || findCategoryForIssue(complaint.wasteType);
    return inferred?.id || GARBAGE_CATEGORY_ID;
  };

  const complaintIssue = (complaint) =>
    complaint.complaintType || complaint.wasteType || "";

  const toComplaintView = (complaint, actor) => {
    const finished = [STATUS.RESOLVED, STATUS.CITIZEN_VERIFICATION, STATUS.CLOSED, STATUS.REJECTED].includes(
      complaint.status
    );
    const days = daysBetween(complaint.createdAt, finished ? complaint.updatedAt : Date.now());
    const complaintCategory = complaintCategoryId(complaint);
    const complaintType = complaintIssue(complaint);
    const assignedOfficer = officerRecord(complaint.assignedOfficerId);
    const representative = representatives().find(
      (person) => person.id === complaint.representativeId
    );
    const ward = wards().find((item) => item.id === complaint.wardId);

    return {
      ...complaint,
      // `days` and `ward`/`representative` keep the existing cards and details
      // page working exactly as before.
      complaintCategory,
      complaintCategoryLabel: complaintCategoryLabel(complaintCategory),
      complaintType,
      wasteType: complaint.wasteType || complaintType,
      days,
      ward: wardName(complaint.wardId),
      wardArea: ward?.area || "",
      wardZone: ward?.zone || "",
      representative: representativeName(complaint.representativeId),
      representativePhone: representative?.phone || "",
      representativeEmail: representative?.email || "",
      mlaName: representative?.mlaName || "",
      officeAddress: representative?.officeAddress || "",
      assignedOfficer: assignedOfficer ? officerName(assignedOfficer.id) : "",
      assignedOfficerCode: assignedOfficer?.employeeCode || "",
      assignedOfficerZone: assignedOfficer?.zone || "",
      assignedOfficerPhone: assignedOfficer?.phone || "",
      beforePhoto: complaint.beforePhoto || "",
      afterPhoto: complaint.afterPhoto || "",
      workNotes: complaint.workNotes || "",
      aiWasteType: complaint.aiWasteType || "",
      aiConfidence:
        complaint.aiConfidence === undefined || complaint.aiConfidence === null
          ? null
          : Number(complaint.aiConfidence),
      imageFingerprint: complaint.imageFingerprint || "",
      duplicateOfId: complaint.duplicateOfId || "",
      duplicateScore:
        complaint.duplicateScore === undefined || complaint.duplicateScore === null
          ? null
          : Number(complaint.duplicateScore),
      verificationStatus: complaint.verificationStatus || VERIFICATION_STATUS.NOT_REQUESTED,
      verificationPending:
        complaint.verificationStatus === VERIFICATION_STATUS.PENDING ||
        complaint.status === STATUS.RESOLVED ||
        complaint.status === STATUS.CITIZEN_VERIFICATION,
      verificationHistory: [...(complaint.verificationHistory || [])].sort(
        (left, right) => new Date(left.at) - new Date(right.at)
      ),
      mla: `Bhopal ${ward?.zone || "Central"}`,
      upvotes: (complaint.upvotedBy || []).length,
      upvoted: Boolean(actor && complaint.upvotedBy?.includes(actor.id)),
      commentCount: (complaint.comments || []).length,
    };
  };

  const notify = (userId, { title, body, type = "system", complaintId = "" }) => {
    const list = notifications();
    list.unshift({
      id: uid("n"),
      userId,
      title,
      body,
      type,
      complaintId,
      read: false,
      createdAt: new Date().toISOString(),
    });
    write(COLLECTIONS.notifications, list.slice(0, 500));
  };

  const notifyAdmins = (payload) => {
    users()
      .filter((user) => user.role === ROLES.ADMIN && user.status === USER_STATUS.ACTIVE)
      .forEach((admin) => notify(admin.id, payload));
  };

  const notifyOfficer = (officerId, payload) => {
    const officer = officerRecord(officerId);
    if (!officer) return;
    notify(officer.userId, payload);
  };

  /**
   * Offline email notifications use the same configurable templates as the
   * server. Without SMTP there is nothing to deliver, so each message is kept
   * in an outbox collection that the admin screen can inspect.
   */
  const queueEmail = (user, templateKey, vars = {}, complaintId = "") => {
    const config = settings();
    if (config.emailNotifications === false) return null;

    const template = config.emailTemplates?.[templateKey] || EMAIL_TEMPLATES[templateKey];
    if (!template || !user?.email) return null;

    const values = {
      code: `#${String(complaintId).slice(-6).toUpperCase()}`,
      citizenName: user.name || "Resident",
      city: config.cityName || "Bhopal",
      department: config.department || "Bhopal Municipal Corporation",
      ...vars,
    };

    const render = (text) =>
      String(text || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) =>
        values[key] === undefined || values[key] === null ? "" : String(values[key])
      );

    const list = read(COLLECTIONS.emails, []);
    list.unshift({
      id: uid("mail"),
      to: user.email,
      citizenName: user.name || "",
      subject: render(template.subject),
      body: render(template.body),
      templateKey,
      status: "queued",
      transport: "offline",
      error: "",
      complaintId,
      createdAt: new Date().toISOString(),
      sentAt: null,
    });

    write(COLLECTIONS.emails, list.slice(0, 500));
    return list[0];
  };

  const emailFor = (complaint) =>
    users().find((person) => person.id === complaint.userId) || null;

  const complaintVars = (complaint, extra = {}) => ({
    address: complaint.address || "",
    issue: complaintIssue(complaint),
    status: complaint.status || "",
    ward: wardName(complaint.wardId),
    officerName: officerName(complaint.assignedOfficerId),
    ...extra,
  });

  const addTimeline = (complaint, { status, note, by }) => {
    const at = new Date().toISOString();
    complaint.timeline = [
      ...(complaint.timeline || []),
      { status, note: note || "", at, by: by || "System" },
    ];
    complaint.status = status;
    complaint.updatedAt = at;
  };

  const pushTimeline = (complaint, { status, note, by, at = new Date().toISOString() }) => {
    complaint.timeline = [
      ...(complaint.timeline || []),
      { status, note: note || "", at, by: by || "System" },
    ];
  };

  const pushHistory = (complaint, { from, to, note, by, role, at = new Date().toISOString() }) => {
    complaint.statusHistory = [
      ...(complaint.statusHistory || []),
      { from: from || "", to, note: note || "", by: by || "System", role: role || "", at },
    ];
  };

  const changeStatus = (complaint, { status, note, by, role, from }) => {
    const previous = from ?? complaint.status;
    const at = new Date().toISOString();
    pushTimeline(complaint, { status, note, by, at });
    pushHistory(complaint, { from: previous, to: status, note, by, role, at });
    complaint.status = status;
    complaint.updatedAt = at;
  };

  const publicComplaintCount = (userId) =>
    complaints().filter((complaint) => complaint.userId === userId).length;

  /* ------------------------------- auth -------------------------------- */

  const register = async ({
    name,
    email,
    password,
    phone,
    wardId,
    aadhaarNumber: aadhaarValue,
  } = {}) => {
    const settingsValue = settings();

    if (!settingsValue.allowRegistration) {
      throw new AppError(ERROR_CODES.FORBIDDEN, "New registrations are closed right now.");
    }

    const cleanName = requiredText(name, { field: "Name", min: 2, max: 60 });
    const cleanEmail = optionalEmail(email);
    const cleanPassword = validatePassword(password);
    const cleanPhone = mobileNumber(phone);
    const cleanAadhaar = aadhaarRule(aadhaarValue);

    const list = users();

    if (cleanEmail && list.some((person) => person.email === cleanEmail)) {
      throw new AppError(ERROR_CODES.EMAIL_TAKEN, "An account with this email already exists. Try signing in.");
    }

    if (list.some((person) => person.phone && phoneDigits(person.phone) === phoneDigits(cleanPhone))) {
      throw new AppError(ERROR_CODES.CONFLICT, "That mobile number is already registered.");
    }

    const aadhaarHash = await hashAadhaar(cleanAadhaar);

    if (list.some((person) => person.aadhaarHash && person.aadhaarHash === aadhaarHash)) {
      throw new AppError(ERROR_CODES.CONFLICT, "That Aadhaar number is already registered.");
    }

    const last4 = aadhaarLast4(cleanAadhaar);
    const now = new Date().toISOString();

    const user = {
      id: uid("u"),
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      wardId: wardId ? String(wardId) : "",
      role: ROLES.USER,
      status: USER_STATUS.ACTIVE,
      passwordHash: await hashPassword(cleanPassword),
      aadhaarEncrypted: await encryptAadhaar(cleanAadhaar),
      aadhaarLast4: last4,
      aadhaarHash,
      aadhaarVerified: false,
      aadhaarVerifiedAt: null,
      aadhaarSubmittedAt: now,
      verificationStatus: AADHAAR_STATUS.PENDING,
      verificationRemarks: "",
      verificationAudit: [
        {
          action: "aadhaar.submitted",
          result: AADHAAR_STATUS.PENDING,
          remarks: "",
          last4,
          by: cleanName,
          at: now,
        },
      ],
      createdAt: now,
    };

    list.push(user);
    write(COLLECTIONS.users, list);

    notify(user.id, {
      title: "Welcome to Nagarik Bhopal",
      body: "Report an issue, track progress and upvote problems around you.",
    });

    notify(user.id, {
      title: "Aadhaar verification submitted",
      body: `Your Aadhaar ending ${last4} is waiting for city office review. You can submit complaints once it is verified.`,
    });

    return { token: await issueToken(user), user: toPublicUser(user) };
  };

  /**
   * Submit or retry Aadhaar verification from the profile. Only complaint
   * submission is gated on the result, never sign-in.
   */
  const submitAadhaar = async ({ aadhaarNumber: aadhaarValue } = {}, actor) => {
    const user = requireUser(actor);
    const list = users();
    const record = list.find((person) => person.id === user.id);

    if (!record) {
      throw new AppError(ERROR_CODES.NOT_FOUND, "Your account could not be found.");
    }

    if (record.role !== ROLES.USER) {
      throw new AppError(ERROR_CODES.FORBIDDEN, "Only resident accounts have Aadhaar verification.");
    }

    if (record.aadhaarVerified || record.verificationStatus === AADHAAR_STATUS.VERIFIED) {
      throw new AppError(ERROR_CODES.CONFLICT, "Your identity is already verified.");
    }

    const cleanAadhaar = aadhaarRule(aadhaarValue);
    const aadhaarHash = await hashAadhaar(cleanAadhaar);

    if (
      list.some(
        (person) =>
          person.id !== record.id && person.aadhaarHash && person.aadhaarHash === aadhaarHash
      )
    ) {
      throw new AppError(ERROR_CODES.CONFLICT, "That Aadhaar number is already registered.");
    }

    const last4 = aadhaarLast4(cleanAadhaar);
    const now = new Date().toISOString();

    record.aadhaarEncrypted = await encryptAadhaar(cleanAadhaar);
    record.aadhaarLast4 = last4;
    record.aadhaarHash = aadhaarHash;
    record.aadhaarVerified = false;
    record.aadhaarVerifiedAt = null;
    record.aadhaarSubmittedAt = now;
    record.verificationStatus = AADHAAR_STATUS.PENDING;
    record.verificationRemarks = "";
    record.verificationAudit = [
      ...(record.verificationAudit || []),
      {
        action: "aadhaar.submitted",
        result: AADHAAR_STATUS.PENDING,
        remarks: "",
        last4,
        by: record.name,
        at: now,
      },
    ];

    write(COLLECTIONS.users, list);

    notify(record.id, {
      title: "Aadhaar verification submitted",
      body: `Your Aadhaar ending ${last4} is waiting for city office review. You can submit complaints once it is verified.`,
    });

    return {
      user: toPublicUser(record),
      message: "Aadhaar submitted. The city office will review it shortly.",
    };
  };

  const loginWithRole = async ({ identifier, email, password } = {}, expectedRole) => {
    const lookup = loginIdentifier(identifier ?? email);
    const cleanPassword = String(password ?? "");

    if (!cleanPassword) {
      throw new AppError(ERROR_CODES.VALIDATION, "Password is required.");
    }

    const user = users().find((person) =>
      lookup.type === "email"
        ? person.email === lookup.value
        : Boolean(person.phone) && phoneDigits(person.phone) === lookup.value
    );

    // Same message for "no such user" and "wrong password" so accounts cannot
    // be enumerated from the login form.
    if (!user || !(await verifyPassword(cleanPassword, user.passwordHash))) {
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, "Email or password is incorrect.");
    }

    if (user.status === USER_STATUS.BLOCKED) {
      throw new AppError(ERROR_CODES.BLOCKED, "This account has been blocked. Contact the city office.");
    }

    if (expectedRole && user.role !== expectedRole) {
      const message =
        expectedRole === ROLES.ADMIN
          ? "This account does not have administrator access."
          : expectedRole === ROLES.OFFICER
            ? "This account does not have sanitation officer access."
            : user.role === ROLES.OFFICER
              ? "Officer accounts must use the officer sign-in page."
              : "Administrators must use the admin sign-in page.";
      throw new AppError(ERROR_CODES.FORBIDDEN, message);
    }

    return { token: await issueToken(user), user: toPublicUser(user) };
  };

  const login = (args) => loginWithRole(args, ROLES.USER);
  const adminLogin = (args) => loginWithRole(args, ROLES.ADMIN);
  const officerLogin = (args) => loginWithRole(args, ROLES.OFFICER);

  const me = async ({ token } = {}) => ({ user: toPublicUser(await authenticate(token)) });

  const updateProfile = async ({ name, phone, wardId } = {}, actor) => {
    const user = requireUser(actor);
    const list = users();
    const record = list.find((person) => person.id === user.id);

    record.name = requiredText(name ?? record.name, { field: "Name", min: 2, max: 60 });
    record.phone = phoneNumber(phone ?? record.phone);
    record.wardId = wardId !== undefined ? String(wardId) : record.wardId;

    write(COLLECTIONS.users, list);

    return { user: toPublicUser(record), message: "Profile updated." };
  };

  const changePassword = async ({ currentPassword, newPassword } = {}, actor) => {
    const user = requireUser(actor);
    const list = users();
    const record = list.find((person) => person.id === user.id);

    if (!(await verifyPassword(String(currentPassword ?? ""), record.passwordHash))) {
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, "Your current password is incorrect.");
    }

    if (String(currentPassword) === String(newPassword)) {
      throw new AppError(ERROR_CODES.VALIDATION, "Choose a password you have not used before.");
    }

    record.passwordHash = await hashPassword(validatePassword(newPassword, { field: "New password" }));
    write(COLLECTIONS.users, list);

    return { message: "Password updated." };
  };

  /* ---------------------------- complaints ----------------------------- */

  const listComplaints = async (query = {}, actor) => {
    const term = String(query.search || "").trim().toLowerCase();

    let items = [...complaints()];

    if (actor?.role === ROLES.OFFICER) {
      const officer = officerFor(actor);
      items = items.filter((complaint) => complaint.assignedOfficerId === officer.id);
    } else if (query.assignedOfficerId) {
      items = items.filter((complaint) => complaint.assignedOfficerId === query.assignedOfficerId);
    }

    if (query.verificationStatus) {
      items = items.filter(
        (complaint) =>
          (complaint.verificationStatus || VERIFICATION_STATUS.NOT_REQUESTED) ===
          query.verificationStatus
      );
    }

    if (query.scope === "mine") {
      const user = requireUser(actor);
      items = items.filter((complaint) => complaint.userId === user.id);
    }

    if (query.complaintCategory) {
      items = items.filter((item) => complaintCategoryId(item) === query.complaintCategory);
    }
    if (query.complaintType) {
      items = items.filter((item) => complaintIssue(item) === query.complaintType);
    }
    if (query.wasteType) items = items.filter((item) => item.wasteType === query.wasteType);
    if (query.wardId) items = items.filter((item) => item.wardId === query.wardId);
    if (query.priority) items = items.filter((item) => item.priority === query.priority);
    if (query.representativeId) {
      items = items.filter((item) => item.representativeId === query.representativeId);
    }

    // Report filters use calendar dates (YYYY-MM-DD); include the whole end day.
    const boundary = (value, endOfDay) => {
      const text = String(value || "").trim();
      if (!text) return null;
      const date = new Date(text.length === 10 ? `${text}T${endOfDay ? "23:59:59.999" : "00:00:00"}` : text);
      return Number.isNaN(date.getTime()) ? null : date.getTime();
    };

    const from = boundary(query.from, false);
    const to = boundary(query.to, true);
    if (from !== null) items = items.filter((item) => new Date(item.createdAt).getTime() >= from);
    if (to !== null) items = items.filter((item) => new Date(item.createdAt).getTime() <= to);

    if (term) {
      const representative = (item) =>
        representatives().find((person) => person.id === item.representativeId) || null;
      const officer = (item) => officerRecord(item.assignedOfficerId);

      items = items.filter((item) =>
        [
          item.id,
          item.address,
          item.description,
          complaintIssue(item),
          complaintCategoryLabel(complaintCategoryId(item)),
          item.userName,
          wardName(item.wardId),
          representative(item)?.name || "",
          representative(item)?.mlaName || "",
          officer(item)?.employeeCode || "",
          officerName(item.assignedOfficerId),
        ]
          .join(" ")
          .toLowerCase()
          .includes(term)
      );
    }

    const statusCounts = STATUS_LIST.reduce((accumulator, status) => {
      accumulator[status] = items.filter((item) => item.status === status).length;
      return accumulator;
    }, {});

    if (query.status) items = items.filter((item) => item.status === query.status);

    items.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

    const total = items.length;
    // Reports export asks for a larger page; normal lists stay at PAGE_SIZE.
    const limit = Math.min(Math.max(Number(query.limit) || PAGE_SIZE, 1), 200);
    const pages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(Math.max(Number(query.page) || 1, 1), pages);
    const start = (page - 1) * limit;

    return {
      items: items.slice(start, start + limit).map((item) => toComplaintView(item, actor)),
      total,
      page,
      pages,
      statusCounts,
    };
  };

  const getComplaint = async ({ id } = {}, actor) => {
    const complaint = findComplaint(id);

    if (actor?.role === ROLES.OFFICER) {
      const officer = officerFor(actor);
      if (complaint.assignedOfficerId !== officer.id) {
        throw new AppError(ERROR_CODES.FORBIDDEN, "This complaint is not assigned to you.");
      }
    }

    const view = toComplaintView(complaint, actor);

    view.comments = [...(complaint.comments || [])].sort(
      (left, right) => new Date(left.createdAt) - new Date(right.createdAt)
    );
    view.statusHistory = [...(complaint.statusHistory || [])].sort(
      (left, right) => new Date(left.at) - new Date(right.at)
    );

    return { complaint: view };
  };

  const createComplaint = async (payload = {}, actor) => {
    const user = requireUser(actor);
    const clean = complaintPayload(payload);
    const settingsValue = settings();

    const userRecord = users().find((person) => person.id === user.id);

    if (userRecord?.role === ROLES.USER && !userRecord.aadhaarVerified) {
      throw new AppError(
        ERROR_CODES.FORBIDDEN,
        "Please complete Aadhaar verification before submitting a complaint."
      );
    }

    const detectedWard =
      wards().find((ward) => ward.id === clean.wardId) ||
      (settingsValue.autoAssignWard && clean.position
        ? wards().find((ward) => findNearestWard(...clean.position)?.id === ward.id)
        : null) ||
      wards().find((ward) => ward.id === userRecord?.wardId) ||
      wards()[0];

    const representative = representatives().find(
      (person) => person.wardId === detectedWard?.id
    );
    const routedOfficer =
      settingsValue.autoAssignWard && detectedWard?.assignedOfficerId
        ? officers().find(
            (officer) =>
              officer.id === detectedWard.assignedOfficerId && officer.isActive !== false
          )
        : null;

    const now = new Date().toISOString();
    const aiWasteType = String(payload.aiWasteType || "").trim();
    const aiConfidence = Number(payload.aiConfidence);

    const complaint = {
      id: uid("c"),
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      wasteType: clean.wasteType,
      complaintCategory: clean.complaintCategory,
      complaintType: clean.complaintType,
      description: clean.description,
      address: clean.address,
      wardId: detectedWard?.id || "",
      ward: detectedWard?.name || "Unassigned",
      representativeId: representative?.id || "",
      representative: representative?.name || "Not assigned",
      assignedOfficerId: routedOfficer?.id || "",
      status: routedOfficer ? STATUS.ASSIGNED : STATUS.PENDING,
      priority: clean.priority,
      image: clean.image,
      position: clean.position,
      beforePhoto: "",
      afterPhoto: "",
      workNotes: "",
      aiWasteType: aiWasteType || (clean.complaintCategory === GARBAGE_CATEGORY_ID ? clean.complaintType : ""),
      aiConfidence: Number.isFinite(aiConfidence) && aiConfidence > 0 ? aiConfidence : null,
      imageFingerprint: String(payload.imageFingerprint || ""),
      duplicateOfId: String(payload.duplicateOfId || ""),
      duplicateScore: payload.duplicateOfId ? 1 : null,
      verificationStatus: VERIFICATION_STATUS.NOT_REQUESTED,
      verificationHistory: [],
      upvotedBy: [],
      comments: [],
      assignments: routedOfficer
        ? [
            {
              id: uid("asg"),
              officerId: routedOfficer.id,
              assignedBy: "System",
              note: "Automatic ward routing",
              assignedAt: now,
              unassignedAt: null,
              active: true,
            },
          ]
        : [],
      statusHistory: [
        {
          from: "",
          to: STATUS.PENDING,
          note: "Complaint submitted.",
          by: user.name,
          role: user.role,
          at: now,
        },
      ],
      timeline: [
        {
          status: STATUS.PENDING,
          at: now,
          by: user.name,
          note: "Complaint submitted.",
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    if (routedOfficer) {
      pushTimeline(complaint, {
        status: STATUS.ACCEPTED,
        note: "Complaint accepted by automatic ward routing.",
        by: "System",
        at: now,
      });
      pushHistory(complaint, {
        from: STATUS.PENDING,
        to: STATUS.ACCEPTED,
        note: "Complaint accepted by automatic ward routing.",
        by: "System",
        role: "system",
        at: now,
      });
      pushTimeline(complaint, {
        status: STATUS.ASSIGNED,
        note: `Auto-assigned to ${officerName(routedOfficer.id)}${
          routedOfficer.employeeCode ? ` (${routedOfficer.employeeCode})` : ""
        }${detectedWard ? ` · ${detectedWard.name}` : ""}.`,
        by: "System",
        at: now,
      });
      pushHistory(complaint, {
        from: STATUS.ACCEPTED,
        to: STATUS.ASSIGNED,
        note: "Complaint routed automatically to the ward officer.",
        by: "System",
        role: "system",
        at: now,
      });
      complaint.status = STATUS.ASSIGNED;
    }

    write(COLLECTIONS.complaints, [complaint, ...complaints()]);

    notify(user.id, {
      title: `Complaint #${complaint.id.slice(-6)} received`,
      body: `${complaint.wasteType} at ${complaint.address} is now ${complaint.status.toLowerCase()}.`,
      type: "complaint",
      complaintId: complaint.id,
    });

    queueEmail(emailFor(complaint), "complaintSubmitted", complaintVars(complaint), complaint.id);

    if (routedOfficer) {
      notify(routedOfficer.userId, {
        title: `New complaint assigned: #${complaint.id.slice(-6)}`,
        body: `${complaint.address}. Open your dashboard to start the work.`,
        type: "complaint",
        complaintId: complaint.id,
      });
      queueEmail(
        emailFor(complaint),
        "complaintAccepted",
        complaintVars(complaint, { officerName: officerName(routedOfficer.id) }),
        complaint.id
      );
      queueEmail(
        emailFor(complaint),
        "officerAssigned",
        complaintVars(complaint, { officerName: officerName(routedOfficer.id) }),
        complaint.id
      );
    }

    if (complaint.duplicateOfId) {
      const stored = complaints();
      const original = stored.find(
        (item) => String(item.id) === String(complaint.duplicateOfId)
      );

      if (original && original.userId !== user.id) {
        original.upvotedBy = [...new Set([...(original.upvotedBy || []), user.id])];
        write(COLLECTIONS.complaints, stored);
        notify(original.userId, {
          title: "Someone reported the same issue",
          body: `Complaint #${original.id.slice(-6)} received another “me too” from a neighbour.`,
          type: "upvote",
          complaintId: original.id,
        });
      }
    }

    if (settingsValue.notifyOnNewComplaint) {
      notifyAdmins({
        title: "New complaint reported",
        body: `${user.name} reported ${complaint.wasteType} in ${complaint.ward}.`,
        type: "admin",
        complaintId: complaint.id,
      });
    }

    return { complaint: toComplaintView(complaint, user) };
  };

  const upvoteComplaint = async ({ id } = {}, actor) => {
    const user = requireUser(actor);
    const list = complaints();
    const complaint = list.find((item) => String(item.id) === String(id));

    if (!complaint) throw new AppError(ERROR_CODES.NOT_FOUND, `Complaint #${id} could not be found.`);

    complaint.upvotedBy = complaint.upvotedBy || [];
    const already = complaint.upvotedBy.includes(user.id);

    complaint.upvotedBy = already
      ? complaint.upvotedBy.filter((person) => person !== user.id)
      : [...complaint.upvotedBy, user.id];

    write(COLLECTIONS.complaints, list);

    if (!already && complaint.userId !== user.id) {
      notify(complaint.userId, {
        title: "Someone said “Me too”",
        body: `${user.name} upvoted your ${complaint.wasteType} report.`,
        type: "upvote",
        complaintId: complaint.id,
      });
    }

    return { complaint: toComplaintView(complaint, user), message: already ? "Upvote removed." : "Thanks for the support." };
  };

  const addComment = async ({ id, text } = {}, actor) => {
    const user = requireUser(actor);
    const clean = commentText(text);
    const list = complaints();
    const complaint = list.find((item) => String(item.id) === String(id));

    if (!complaint) throw new AppError(ERROR_CODES.NOT_FOUND, `Complaint #${id} could not be found.`);

    complaint.comments = [
      ...(complaint.comments || []),
      {
        id: uid("cm"),
        userId: user.id,
        userName: user.name,
        text: clean,
        createdAt: new Date().toISOString(),
      },
    ];

    write(COLLECTIONS.complaints, list);

    if (complaint.userId !== user.id) {
      notify(complaint.userId, {
        title: "New comment on your report",
        body: `${user.name}: ${clean.slice(0, 90)}`,
        type: "comment",
        complaintId: complaint.id,
      });
    }

    return { complaint: toComplaintView(complaint, user) };
  };

  const statusNoteOffline = (status) => {
    if (status === STATUS.RESOLVED) return "Work completed. Awaiting citizen verification.";
    if (status === STATUS.CITIZEN_VERIFICATION) return "Work completed. Awaiting citizen verification.";
    if (status === STATUS.CLOSED) return "The citizen confirmed the issue is resolved.";
    if (status === STATUS.REOPENED) return "The citizen reported that the issue is not resolved.";
    if (status === STATUS.ASSIGNED) return "A sanitation officer has been assigned.";
    if (status === STATUS.ACCEPTED) return "The complaint has been accepted by the ward team.";
    if (status === STATUS.IN_PROGRESS) return "Sanitation work has started.";
    if (status === STATUS.REJECTED) return "Report closed by the city team.";
    return "Status moved back to Pending.";
  };

  const requestVerificationOffline = (complaint, actor, payload = {}) => {
    const from = complaint.status;
    const at = new Date().toISOString();
    const note =
      optionalText(payload.note, { field: "Note", max: 200 }) ||
      "Cleaning completed by the sanitation team. Awaiting citizen verification.";

    if (payload.beforePhoto !== undefined) {
      complaint.beforePhoto = photoValue(payload.beforePhoto, "Before cleaning photo");
    }
    if (payload.afterPhoto !== undefined) {
      complaint.afterPhoto = photoValue(payload.afterPhoto, "After cleaning photo");
    }
    if (payload.workNotes !== undefined) {
      complaint.workNotes = workNotesRule(payload.workNotes);
    }

    pushTimeline(complaint, { status: STATUS.RESOLVED, note, by: actor.name, at });
    pushHistory(complaint, { from, to: STATUS.RESOLVED, note, by: actor.name, role: actor.role, at });
    pushTimeline(complaint, {
      status: STATUS.CITIZEN_VERIFICATION,
      note: "Citizen asked: Has your issue been resolved?",
      by: "System",
      at,
    });
    pushHistory(complaint, {
      from: STATUS.RESOLVED,
      to: STATUS.CITIZEN_VERIFICATION,
      note: "Citizen verification requested.",
      by: "System",
      role: "system",
      at,
    });

    complaint.status = STATUS.CITIZEN_VERIFICATION;
    complaint.verificationStatus = VERIFICATION_STATUS.PENDING;
    complaint.resolvedAt = at;
    complaint.verifiedAt = null;
    complaint.closedAt = null;
    complaint.updatedAt = at;
    complaint.verificationHistory = [
      ...(complaint.verificationHistory || []),
      { decision: "requested", note: "Citizen verification requested.", by: "System", role: "system", at },
    ];

    notify(complaint.userId, {
      title: `Complaint #${complaint.id.slice(-6)} marked resolved`,
      body: "Has your issue been resolved? Open the complaint and confirm Yes or No.",
      type: "status",
      complaintId: complaint.id,
    });

    queueEmail(emailFor(complaint), "complaintResolved", complaintVars(complaint), complaint.id);
  };

  const updateComplaintStatus = async ({ id, status, note, ...rest } = {}, actor) => {
    const admin = requireAdmin(actor);
    const cleanStatus = statusValue(status);
    const list = complaints();
    const complaint = list.find((item) => String(item.id) === String(id));

    if (!complaint) throw new AppError(ERROR_CODES.NOT_FOUND, `Complaint #${id} could not be found.`);
    if (complaint.status === cleanStatus) {
      throw new AppError(ERROR_CODES.CONFLICT, `This complaint is already marked ${cleanStatus}.`);
    }

    const cleanNote =
      optionalText(note, { field: "Note", max: 200 }) || statusNoteOffline(cleanStatus);

    if (cleanStatus === STATUS.RESOLVED || cleanStatus === STATUS.CITIZEN_VERIFICATION) {
      requestVerificationOffline(complaint, admin, { ...rest, note: cleanNote });
      write(COLLECTIONS.complaints, list);
      return {
        complaint: toComplaintView(complaint, admin),
        message: "Complaint resolved. The citizen has been asked to verify.",
      };
    }

    changeStatus(complaint, {
      status: cleanStatus,
      note: cleanNote,
      by: admin.name,
      role: admin.role,
    });

    if (cleanStatus === STATUS.CLOSED) {
      complaint.verificationStatus = VERIFICATION_STATUS.VERIFIED;
      complaint.verifiedAt = new Date().toISOString();
      complaint.closedAt = complaint.verifiedAt;
    } else if (cleanStatus === STATUS.REOPENED) {
      complaint.verificationStatus = VERIFICATION_STATUS.REOPENED;
      complaint.reopenedAt = new Date().toISOString();
    }

    write(COLLECTIONS.complaints, list);

    notify(complaint.userId, {
      title: `Complaint update: ${cleanStatus}`,
      body: cleanNote,
      type: "status",
      complaintId: complaint.id,
    });

    const templateByStatus = {
      [STATUS.ACCEPTED]: "complaintAccepted",
      [STATUS.ASSIGNED]: "officerAssigned",
      [STATUS.IN_PROGRESS]: "workStarted",
      [STATUS.CLOSED]: "complaintClosed",
      [STATUS.REOPENED]: "complaintReopened",
    };

    if (templateByStatus[cleanStatus]) {
      queueEmail(
        emailFor(complaint),
        templateByStatus[cleanStatus],
        complaintVars(complaint, { status: cleanStatus }),
        complaint.id
      );
    }

    if (cleanStatus === STATUS.REOPENED) {
      notifyAdmins({
        title: `Complaint #${complaint.id.slice(-6)} reopened`,
        body: `${complaint.address} was reopened after review.`,
        type: "admin",
        complaintId: complaint.id,
      });
      notifyOfficer(complaint.assignedOfficerId, {
        title: `Complaint #${complaint.id.slice(-6)} reopened`,
        body: `${complaint.address} needs another visit.`,
        type: "status",
        complaintId: complaint.id,
      });
    }

    return { complaint: toComplaintView(complaint, admin), message: `Marked ${cleanStatus}.` };
  };

  /**
   * Administrators may also record the before/after photos and work notes. The
   * offline store mirrors the server rule: only an administrator can call this.
   */
  const updateComplaintWork = async ({ id, note, workNotes, beforePhoto, afterPhoto } = {}, actor) => {
    const admin = requireAdmin(actor);
    const list = complaints();
    const complaint = list.find((item) => String(item.id) === String(id));
    if (!complaint) throw new AppError(ERROR_CODES.NOT_FOUND, `Complaint #${id} could not be found.`);

    if (beforePhoto !== undefined) {
      complaint.beforePhoto = photoValue(beforePhoto, "Before cleaning photo");
    }
    if (afterPhoto !== undefined) {
      complaint.afterPhoto = photoValue(afterPhoto, "After cleaning photo");
    }
    if (workNotes !== undefined) complaint.workNotes = workNotesRule(workNotes);

    const summary =
      optionalText(note, { field: "Note", max: 200 }) ||
      (workNotes ? `Work notes: ${String(workNotes).slice(0, 180)}` : "Work photos updated by the city office.");

    pushTimeline(complaint, {
      status: complaint.status,
      note: summary,
      by: admin.name,
      at: new Date().toISOString(),
    });

    complaint.updatedAt = new Date().toISOString();
    write(COLLECTIONS.complaints, list);

    return { complaint: toComplaintView(complaint, admin), message: "Work details saved." };
  };

  const acceptComplaint = async ({ id, note } = {}, actor) => {
    if (!actor || ![ROLES.ADMIN, ROLES.OFFICER].includes(actor.role)) {
      throw new AppError(
        ERROR_CODES.FORBIDDEN,
        "Only administrators and sanitation officers can accept a complaint."
      );
    }

    const list = complaints();
    const complaint = list.find((item) => String(item.id) === String(id));
    if (!complaint) throw new AppError(ERROR_CODES.NOT_FOUND, `Complaint #${id} could not be found.`);

    if (actor.role === ROLES.OFFICER) {
      const officer = officerFor(actor);
      if (complaint.assignedOfficerId !== officer.id) {
        throw new AppError(ERROR_CODES.FORBIDDEN, "This complaint is not assigned to you.");
      }
    }

    if (![STATUS.PENDING, STATUS.REOPENED].includes(complaint.status)) {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        `This complaint is already ${complaint.status.toLowerCase()}.`
      );
    }

    const cleanNote =
      optionalText(note, { field: "Note", max: 200 }) || statusNoteOffline(STATUS.ACCEPTED);

    changeStatus(complaint, {
      status: STATUS.ACCEPTED,
      note: cleanNote,
      by: actor.name,
      role: actor.role,
    });

    write(COLLECTIONS.complaints, list);

    notify(complaint.userId, {
      title: `Complaint #${complaint.id.slice(-6)} accepted`,
      body: cleanNote,
      type: "status",
      complaintId: complaint.id,
    });

    queueEmail(
      emailFor(complaint),
      "complaintAccepted",
      complaintVars(complaint, { status: STATUS.ACCEPTED }),
      complaint.id
    );

    return { complaint: toComplaintView(complaint, actor), message: "Complaint accepted." };
  };

  /**
   * Nearby open complaints for duplicate detection. Distance uses the same
   * equirectangular approximation as the map; the image fingerprint compares
   * exactly, which is enough until a real image-similarity model is plugged in.
   */
  const checkDuplicates = async (payload = {}, actor) => {
    if (!actor) throw new AppError(ERROR_CODES.UNAUTHENTICATED, "Please sign in to continue.");

    const category =
      findComplaintCategory(payload.complaintCategory) ||
      findCategoryForIssue(payload.complaintType || payload.wasteType);
    const position = Array.isArray(payload.position)
      ? payload.position.map(Number)
      : null;
    const validPosition =
      position && position.length === 2 && position.every(Number.isFinite) ? position : null;

    if (!category && !validPosition) return { matches: [] };

    const fingerprint = String(payload.imageFingerprint || "");

    const matches = complaints()
      .filter(
        (complaint) =>
          String(complaint.id) !== String(payload.excludeId || "") &&
          ![STATUS.REJECTED, STATUS.CLOSED].includes(complaint.status) &&
          (complaint.complaintCategory || GARBAGE_CATEGORY_ID) ===
            (category?.id || GARBAGE_CATEGORY_ID)
      )
      .map((complaint) => {
        const point = complaint.position;
        let distance = null;

        if (validPosition && Array.isArray(point) && point.length === 2) {
          const [latitude, longitude] = validPosition;
          const km =
            111.32 *
            Math.hypot(
              point[0] - latitude,
              (point[1] - longitude) * Math.cos((latitude * Math.PI) / 180)
            );
          distance = Math.round(km * 100) / 100;
        }

        const sameImage = Boolean(
          fingerprint && complaint.imageFingerprint === fingerprint
        );
        const nearby = distance !== null && distance <= 0.35;
        if (!sameImage && !nearby) return null;

        return {
          id: complaint.id,
          code: `#${String(complaint.id).slice(-6).toUpperCase()}`,
          userName: complaint.userName || "Resident",
          complaintCategory: complaint.complaintCategory || GARBAGE_CATEGORY_ID,
          complaintType: complaintIssue(complaint),
          address: complaint.address || "",
          ward: wardName(complaint.wardId),
          status: complaint.status,
          image: complaint.image || "",
          upvotes: (complaint.upvotedBy || []).length,
          createdAt: complaint.createdAt,
          distanceKm: distance,
          sameImage,
          score: sameImage ? 1 : Math.max(0.4, Math.min(0.95, 1 - distance / 0.455)),
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.score - left.score)
      .slice(0, 5)
      .map((match) => ({ ...match, score: Math.round(match.score * 100) / 100 }));

    return { matches };
  };

  const assignComplaint = async ({ id, wardId, representativeId, officerId, note } = {}, actor) => {
    const admin = requireAdmin(actor);
    const list = complaints();
    const complaint = list.find((item) => String(item.id) === String(id));

    if (!complaint) throw new AppError(ERROR_CODES.NOT_FOUND, `Complaint #${id} could not be found.`);

    let ward = null;
    if (wardId !== undefined) {
      if (wardId === "") {
        complaint.wardId = "";
      } else {
        ward = wards().find((item) => item.id === wardId);
        if (!ward) throw new AppError(ERROR_CODES.VALIDATION, "Choose a valid ward.");
        complaint.wardId = ward.id;
      }
    }

    if (representativeId !== undefined) {
      const person = representatives().find((item) => item.id === representativeId);
      complaint.representativeId = person?.id || "";
    }

    let officer = null;
    if (officerId !== undefined) {
      if (officerId === "") {
        complaint.assignedOfficerId = "";
      } else {
        officer = officers().find(
          (item) => item.id === officerId && item.isActive !== false
        );
        if (!officer) {
          throw new AppError(ERROR_CODES.VALIDATION, "Choose an active sanitation officer.");
        }
        complaint.assignedOfficerId = officer.id;
      }

      const now = new Date().toISOString();
      complaint.assignments = (complaint.assignments || []).map((assignment) =>
        assignment.active ? { ...assignment, active: false, unassignedAt: now } : assignment
      );

      if (officer) {
        complaint.assignments.push({
          id: uid("asg"),
          officerId: officer.id,
          assignedBy: admin.name,
          note: optionalText(note, { field: "Note", max: 200 }),
          assignedAt: now,
          unassignedAt: null,
          active: true,
        });
      }
    }

    const previousStatus = complaint.status;
    const nextStatus =
      officer && [STATUS.PENDING, STATUS.ACCEPTED, STATUS.REOPENED].includes(previousStatus)
        ? STATUS.ASSIGNED
        : !officer && previousStatus === STATUS.ASSIGNED
          ? STATUS.PENDING
          : previousStatus;

    const assignmentNote = officer
      ? `Assigned to ${officerName(officer.id)}${officer.employeeCode ? ` (${officer.employeeCode})` : ""}${
          ward ? ` · ${ward.name} · ${ward.area}` : ""
        }.`
      : `Assigned to ${wardName(complaint.wardId)} · ${representativeName(complaint.representativeId)}.`;

    if (nextStatus !== previousStatus) {
      changeStatus(complaint, {
        status: nextStatus,
        note: assignmentNote,
        by: admin.name,
        role: admin.role,
      });
    } else {
      pushTimeline(complaint, {
        status: nextStatus,
        note: assignmentNote,
        by: admin.name,
      });
      complaint.updatedAt = new Date().toISOString();
    }

    write(COLLECTIONS.complaints, list);

    if (officer) {
      notify(complaint.userId, {
        title: `Complaint #${complaint.id.slice(-6)} assigned`,
        body: `Your report was assigned to sanitation officer ${officerName(officer.id)}.`,
        type: "status",
        complaintId: complaint.id,
      });
      notify(officer.userId, {
        title: `New complaint assigned: #${complaint.id.slice(-6)}`,
        body: `${complaint.address}. Open your dashboard to start the work.`,
        type: "complaint",
        complaintId: complaint.id,
      });

      queueEmail(
        emailFor(complaint),
        "officerAssigned",
        complaintVars(complaint, {
          status: STATUS.ASSIGNED,
          officerName: officerName(officer.id),
        }),
        complaint.id
      );
    }

    return {
      complaint: toComplaintView(complaint, admin),
      message: officer
        ? `Assigned to ${officerName(officer.id)}.`
        : `Assigned to ${wardName(complaint.wardId)} · ${representativeName(complaint.representativeId)}.`,
    };
  };

  /* ------------------------- citizen verification ---------------------- */

  const verifyComplaint = async ({ id, resolved, note } = {}, actor) => {
    const user = requireUser(actor);
    const list = complaints();
    const complaint = list.find((item) => String(item.id) === String(id));

    if (!complaint) throw new AppError(ERROR_CODES.NOT_FOUND, `Complaint #${id} could not be found.`);

    if (user.role === ROLES.OFFICER) {
      throw new AppError(ERROR_CODES.FORBIDDEN, "Officers cannot verify a citizen's complaint.");
    }
    if (user.role !== ROLES.ADMIN && complaint.userId !== user.id) {
      throw new AppError(
        ERROR_CODES.FORBIDDEN,
        "Only the citizen who reported this issue can verify it."
      );
    }
    if (![STATUS.RESOLVED, STATUS.CITIZEN_VERIFICATION].includes(complaint.status)) {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        "This complaint is not awaiting citizen verification."
      );
    }

    const decision = verificationDecision(resolved);
    const cleanNote =
      optionalText(note, { field: "Note", max: 300 }) ||
      (decision
        ? "Citizen confirmed the issue is resolved."
        : "Citizen reported that the issue is not resolved.");

    if (decision) {
      changeStatus(complaint, {
        status: STATUS.CLOSED,
        note: cleanNote,
        by: user.name,
        role: user.role,
      });
      complaint.verificationStatus = VERIFICATION_STATUS.VERIFIED;
      complaint.verifiedAt = new Date().toISOString();
      complaint.closedAt = complaint.verifiedAt;

      notifyOfficer(complaint.assignedOfficerId, {
        title: `Complaint #${complaint.id.slice(-6)} closed`,
        body: "The citizen confirmed the issue is resolved.",
        type: "status",
        complaintId: complaint.id,
      });
      notifyAdmins({
        title: `Complaint #${complaint.id.slice(-6)} closed`,
        body: `${complaint.address} was verified and closed by the citizen.`,
        type: "admin",
        complaintId: complaint.id,
      });
    } else {
      changeStatus(complaint, {
        status: STATUS.REOPENED,
        note: cleanNote,
        by: user.name,
        role: user.role,
      });
      complaint.verificationStatus = VERIFICATION_STATUS.REOPENED;
      complaint.reopenedAt = new Date().toISOString();

      notifyAdmins({
        title: `Complaint #${complaint.id.slice(-6)} reopened`,
        body: `The citizen says the issue at ${complaint.address} is not resolved.`,
        type: "admin",
        complaintId: complaint.id,
      });
      notifyOfficer(complaint.assignedOfficerId, {
        title: `Complaint #${complaint.id.slice(-6)} reopened`,
        body: "The citizen reported that the issue is not resolved. Please revisit the site.",
        type: "status",
        complaintId: complaint.id,
      });
    }

    complaint.verificationHistory = [
      ...(complaint.verificationHistory || []),
      {
        decision: decision ? "verified" : "reopened",
        note: cleanNote,
        by: user.name,
        role: user.role,
        at: new Date().toISOString(),
      },
    ];

    queueEmail(
      emailFor(complaint),
      decision ? "complaintClosed" : "complaintReopened",
      complaintVars(complaint, { status: decision ? STATUS.CLOSED : STATUS.REOPENED }),
      complaint.id
    );

    write(COLLECTIONS.complaints, list);

    return {
      complaint: toComplaintView(complaint, user),
      message: decision
        ? "Thank you. The complaint is now closed."
        : "The complaint was reopened and the city team has been notified.",
    };
  };

  /* --------------------------- officer workspace ----------------------- */

  const officerView = (officer) => ({
    id: officer.id,
    userId: officer.userId,
    name: users().find((person) => person.id === officer.userId)?.name || "Officer",
    email: users().find((person) => person.id === officer.userId)?.email || "",
    phone: officer.phone || "",
    employeeCode: officer.employeeCode || "",
    designation: officer.designation || "Sanitation Officer",
    zone: officer.zone || "Central",
    active: officer.isActive !== false,
  });

  const listOfficers = async (_args, actor) => {
    requireAdmin(actor);
    return {
      items: officers()
        .filter((officer) => officer.isActive !== false)
        .map((officer) => ({
          ...officerView(officer),
          complaints: complaints().filter(
            (complaint) => complaint.assignedOfficerId === officer.id
          ).length,
        })),
    };
  };

  const officerProfile = async (_args, actor) => {
    const officer = officerFor(actor);
    return { officer: officerView(officer) };
  };

  const officerDashboard = async (_args, actor) => {
    const officer = officerFor(actor);
    const assigned = complaints().filter(
      (complaint) => complaint.assignedOfficerId === officer.id
    );
    const byStatus = countBy(assigned, (complaint) => complaint.status);
    const today = new Date().toDateString();

    return {
      officer: officerView(officer),
      stats: {
        total: assigned.length,
        pending: assigned.filter((complaint) =>
          [STATUS.PENDING, STATUS.ASSIGNED].includes(complaint.status)
        ).length,
        inProgress: assigned.filter((complaint) =>
          [STATUS.IN_PROGRESS, STATUS.REOPENED].includes(complaint.status)
        ).length,
        resolved: assigned.filter((complaint) =>
          [STATUS.RESOLVED, STATUS.CITIZEN_VERIFICATION, STATUS.CLOSED].includes(
            complaint.status
          )
        ).length,
        assignedToday: assigned.filter((complaint) =>
          (complaint.assignments || []).some(
            (assignment) =>
              assignment.officerId === officer.id &&
              new Date(assignment.assignedAt).toDateString() === today
          )
        ).length,
      },
      statusCounts: STATUS_LIST.reduce((accumulator, status) => {
        accumulator[status] = byStatus[status] || 0;
        return accumulator;
      }, {}),
      recent: [...assigned]
        .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
        .slice(0, 6)
        .map((complaint) => toComplaintView(complaint, actor)),
    };
  };

  const assignedComplaint = (id, actor, list = complaints()) => {
    const officer = officerFor(actor);
    const complaint = list.find((item) => String(item.id) === String(id));

    if (!complaint) {
      throw new AppError(ERROR_CODES.NOT_FOUND, `Complaint #${id} could not be found.`);
    }
    if (complaint.assignedOfficerId !== officer.id) {
      throw new AppError(ERROR_CODES.FORBIDDEN, "This complaint is not assigned to you.");
    }

    return { officer, complaint };
  };

  const updateOfficerWork = async ({ id, beforePhoto, afterPhoto, workNotes, note } = {}, actor) => {
    // Read once and mutate that same snapshot: a second read would write a
    // stale list and silently drop the work details.
    const list = complaints();
    const { complaint } = assignedComplaint(id, actor, list);

    if (beforePhoto !== undefined) {
      complaint.beforePhoto = photoValue(beforePhoto, "Before cleaning photo");
    }
    if (afterPhoto !== undefined) {
      complaint.afterPhoto = photoValue(afterPhoto, "After cleaning photo");
    }
    if (workNotes !== undefined) {
      complaint.workNotes = workNotesRule(workNotes);
    }

    pushTimeline(complaint, {
      status: complaint.status,
      note:
        optionalText(note, { field: "Note", max: 200 }) ||
        (complaint.workNotes
          ? `Work notes: ${complaint.workNotes.slice(0, 180)}`
          : "Work photos updated."),
      by: actor.name,
    });
    complaint.updatedAt = new Date().toISOString();

    write(COLLECTIONS.complaints, list);

    return {
      complaint: toComplaintView(complaint, actor),
      message: "Work details saved.",
    };
  };

  const updateOfficerStatus = async (
    { id, status, note, beforePhoto, afterPhoto, workNotes } = {},
    actor
  ) => {
    const list = complaints();
    const { officer, complaint } = assignedComplaint(id, actor, list);
    const cleanStatus = statusValue(status);

    if (![STATUS.IN_PROGRESS, STATUS.RESOLVED].includes(cleanStatus)) {
      throw new AppError(
        ERROR_CODES.VALIDATION,
        "Officers can start work or mark a complaint resolved."
      );
    }

    if (cleanStatus === STATUS.RESOLVED) {
      if ([STATUS.RESOLVED, STATUS.CITIZEN_VERIFICATION, STATUS.CLOSED].includes(complaint.status)) {
        throw new AppError(ERROR_CODES.CONFLICT, "This complaint is already resolved.");
      }

      requestVerificationOffline(complaint, actor, {
        note,
        beforePhoto,
        afterPhoto,
        workNotes,
      });
      write(COLLECTIONS.complaints, list);

      return {
        complaint: toComplaintView(complaint, actor),
        message: "Complaint resolved. The citizen has been asked to verify the fix.",
      };
    }

    if (complaint.status === STATUS.IN_PROGRESS) {
      throw new AppError(ERROR_CODES.CONFLICT, "Work is already in progress.");
    }

    if (beforePhoto !== undefined) {
      complaint.beforePhoto = photoValue(beforePhoto, "Before cleaning photo");
    }
    if (afterPhoto !== undefined) {
      complaint.afterPhoto = photoValue(afterPhoto, "After cleaning photo");
    }
    if (workNotes !== undefined) complaint.workNotes = workNotesRule(workNotes);

    const cleanNote = optionalText(note, { field: "Note", max: 200 }) || "Sanitation work started.";

    changeStatus(complaint, {
      status: STATUS.IN_PROGRESS,
      note: cleanNote,
      by: actor.name,
      role: actor.role,
    });

    write(COLLECTIONS.complaints, list);

    notify(complaint.userId, {
      title: `Work started on complaint #${complaint.id.slice(-6)}`,
      body: `${officerView(officer).name} has started work at ${complaint.address}.`,
      type: "status",
      complaintId: complaint.id,
    });

    return {
      complaint: toComplaintView(complaint, actor),
      message: "Work started. The citizen has been notified.",
    };
  };

  const countBy = (items, selector) =>
    items.reduce((accumulator, item) => {
      const key = selector(item);
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});

  const myStats = async (_args, actor) => {
    const user = requireUser(actor);
    const mine = complaints().filter((complaint) => complaint.userId === user.id);
    const byStatus = countBy(mine, (complaint) => complaint.status);
    const completedStatuses = [STATUS.RESOLVED, STATUS.CITIZEN_VERIFICATION, STATUS.CLOSED];
    const resolved = mine.filter((complaint) => completedStatuses.includes(complaint.status));
    const averageDays = resolved.length
      ? round(
          resolved.reduce(
            (total, complaint) => total + daysBetween(complaint.createdAt, complaint.updatedAt),
            0
          ) / resolved.length
        )
      : 0;

    return {
      total: mine.length,
      pending:
        (byStatus[STATUS.PENDING] || 0) +
        (byStatus[STATUS.ACCEPTED] || 0) +
        (byStatus[STATUS.ASSIGNED] || 0),
      inProgress: (byStatus[STATUS.IN_PROGRESS] || 0) + (byStatus[STATUS.REOPENED] || 0),
      resolved: (byStatus[STATUS.RESOLVED] || 0) +
        (byStatus[STATUS.CITIZEN_VERIFICATION] || 0) +
        (byStatus[STATUS.CLOSED] || 0),
      rejected: byStatus[STATUS.REJECTED] || 0,
      upvotesReceived: mine.reduce((total, complaint) => total + (complaint.upvotedBy?.length || 0), 0),
      averageDays,
      recent: [...mine]
        .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
        .slice(0, 5)
        .map((complaint) => toComplaintView(complaint, user)),
    };
  };

  const analytics = async (_args, actor) => {
    requireAdmin(actor);
    const all = complaints();
    const userList = users().filter((user) => user.role === ROLES.USER);
    const byStatusCounts = countBy(all, (complaint) => complaint.status);
    const byWasteCounts = countBy(all, (complaint) => complaint.wasteType);
    const byCategoryCounts = countBy(all, complaintCategoryId);
    const completed = all.filter((complaint) =>
      [STATUS.RESOLVED, STATUS.CITIZEN_VERIFICATION, STATUS.CLOSED].includes(complaint.status)
    );

    const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(Date.now() - (6 - index) * DAY);
      const label = date.toLocaleDateString("en-IN", { weekday: "short" });
      const count = all.filter(
        (complaint) => new Date(complaint.createdAt).toDateString() === date.toDateString()
      ).length;
      return { label, value: count };
    });

    const byMonth = Array.from({ length: 12 }, (_, index) => {
      const date = new Date();
      date.setDate(1);
      date.setMonth(date.getMonth() - (11 - index));
      const inMonth = all.filter((complaint) => {
        const created = new Date(complaint.createdAt);
        return (
          created.getFullYear() === date.getFullYear() &&
          created.getMonth() === date.getMonth()
        );
      });

      return {
        label: date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
        value: inMonth.length,
        resolved: inMonth.filter((complaint) =>
          [STATUS.RESOLVED, STATUS.CITIZEN_VERIFICATION, STATUS.CLOSED].includes(complaint.status)
        ).length,
      };
    });

    const byDay = Array.from({ length: 14 }, (_, index) => {
      const date = new Date(Date.now() - (13 - index) * DAY);
      return {
        label: date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        value: all.filter(
          (complaint) => new Date(complaint.createdAt).toDateString() === date.toDateString()
        ).length,
      };
    });

    const byOfficer = officers()
      .filter((officer) => officer.isActive !== false)
      .map((officer) => {
        const assigned = all.filter(
          (complaint) => complaint.assignedOfficerId === officer.id
        );
        const done = assigned.filter((complaint) =>
          [STATUS.RESOLVED, STATUS.CITIZEN_VERIFICATION, STATUS.CLOSED].includes(complaint.status)
        );
        const averageDays = done.length
          ? round(
              done.reduce(
                (total, complaint) => total + daysBetween(complaint.createdAt, complaint.updatedAt),
                0
              ) / done.length
            )
          : 0;

        return {
          id: officer.id,
          label: officerName(officer.id),
          value: assigned.length,
          resolved: done.length,
          inProgress: assigned.filter((complaint) => complaint.status === STATUS.IN_PROGRESS).length,
          pending: assigned.filter((complaint) =>
            [STATUS.PENDING, STATUS.ACCEPTED, STATUS.ASSIGNED].includes(complaint.status)
          ).length,
          averageDays,
          zone: officer.zone || "",
        };
      })
      .sort((left, right) => right.resolved - left.resolved);

    const resolutionBuckets = [
      {
        label: "Within 1 day",
        value: completed.filter(
          (complaint) => daysBetween(complaint.createdAt, complaint.updatedAt) <= 1
        ).length,
      },
      {
        label: "1–3 days",
        value: completed.filter((complaint) => {
          const days = daysBetween(complaint.createdAt, complaint.updatedAt);
          return days > 1 && days <= 3;
        }).length,
      },
      {
        label: "3–7 days",
        value: completed.filter((complaint) => {
          const days = daysBetween(complaint.createdAt, complaint.updatedAt);
          return days > 3 && days <= 7;
        }).length,
      },
      {
        label: "Over 7 days",
        value: completed.filter(
          (complaint) => daysBetween(complaint.createdAt, complaint.updatedAt) > 7
        ).length,
      },
    ];

    let running = 0;
    const trend = byMonth.map((row) => {
      running += row.value;
      return { label: row.label, value: running, monthly: row.value };
    });

    return {
      totals: {
        complaints: all.length,
        pending:
          (byStatusCounts[STATUS.PENDING] || 0) +
          (byStatusCounts[STATUS.ACCEPTED] || 0) +
          (byStatusCounts[STATUS.ASSIGNED] || 0),
        accepted: byStatusCounts[STATUS.ACCEPTED] || 0,
        assigned: byStatusCounts[STATUS.ASSIGNED] || 0,
        inProgress: (byStatusCounts[STATUS.IN_PROGRESS] || 0) +
          (byStatusCounts[STATUS.REOPENED] || 0),
        resolved: completed.length,
        citizenVerification: byStatusCounts[STATUS.CITIZEN_VERIFICATION] || 0,
        closed: byStatusCounts[STATUS.CLOSED] || 0,
        reopened: byStatusCounts[STATUS.REOPENED] || 0,
        rejected: byStatusCounts[STATUS.REJECTED] || 0,
        users: userList.length,
        blockedUsers: userList.filter((user) => user.status === USER_STATUS.BLOCKED).length,
        wards: wards().length,
        representatives: representatives().length,
        upvotes: all.reduce((total, complaint) => total + (complaint.upvotedBy?.length || 0), 0),
        resolutionRate: all.length ? Math.round((completed.length / all.length) * 100) : 0,
        averageResolutionDays: completed.length
          ? round(
              completed.reduce(
                (total, complaint) => total + daysBetween(complaint.createdAt, complaint.updatedAt),
                0
              ) / completed.length
            )
          : 0,
        slaDays: settings().slaDays,
      },
      byStatus: STATUS_LIST.map((status) => ({
        label: status,
        value: byStatusCounts[status] || 0,
      })),
      byWaste: WASTE_TYPES.map((type) => ({
        label: type,
        value: byWasteCounts[type] || 0,
      })).filter((row) => row.value > 0),
      byCategory: COMPLAINT_CATEGORIES.map((category) => ({
        id: category.id,
        label: category.label,
        value: byCategoryCounts[category.id] || 0,
      })),
      byWard: wards()
        .map((ward) => {
          const wardComplaints = all.filter((complaint) => complaint.wardId === ward.id);
          return {
            label: `${ward.name} · ${ward.area}`,
            value: wardComplaints.length,
            resolved: wardComplaints.filter((complaint) => complaint.status === STATUS.RESOLVED)
              .length,
          };
        })
        .sort((left, right) => right.value - left.value),
      lastSevenDays,
      byMonth,
      byDay,
      byOfficer,
      resolutionBuckets,
      trend,
      topComplaints: [...all]
        .sort((left, right) => (right.upvotedBy?.length || 0) - (left.upvotedBy?.length || 0))
        .slice(0, 5)
        .map((complaint) => toComplaintView(complaint, actor)),
    };
  };

  /* -------------------------------- users ------------------------------ */

  const listUsers = async ({ search } = {}, actor) => {
    requireAdmin(actor);
    const term = String(search || "").trim().toLowerCase();

    return {
      items: users()
        .filter((user) => user.role === ROLES.USER)
        .filter((user) =>
          term
            ? [user.name, user.email, user.phone, wardName(user.wardId)]
                .join(" ")
                .toLowerCase()
                .includes(term)
            : true
        )
        .map((user) => ({
          ...toPublicUser(user),
          ward: wardName(user.wardId),
          complaints: publicComplaintCount(user.id),
        }))
        .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)),
    };
  };

  const setUserStatus = async ({ userId, status } = {}, actor) => {
    const admin = requireAdmin(actor);
    const cleanStatus = oneOf(status, Object.values(USER_STATUS), "status");

    if (userId === admin.id) {
      throw new AppError(ERROR_CODES.CONFLICT, "You cannot block your own admin account.");
    }

    const list = users();
    const record = list.find((user) => user.id === userId);
    if (!record) throw new AppError(ERROR_CODES.NOT_FOUND, "That user could not be found.");
    if (record.role === ROLES.ADMIN) {
      throw new AppError(ERROR_CODES.FORBIDDEN, "Administrator accounts cannot be blocked here.");
    }

    record.status = cleanStatus;
    write(COLLECTIONS.users, list);

    notify(record.id, {
      title: cleanStatus === USER_STATUS.BLOCKED ? "Account blocked" : "Account re-activated",
      body:
        cleanStatus === USER_STATUS.BLOCKED
          ? "Your account was blocked by the city office. Contact support for details."
          : "Your account is active again. You can report issues.",
    });

    return { user: toPublicUser(record), message: `Account ${cleanStatus}.` };
  };

  /* -------------------------- citizen verification ---------------------- */

  const toCitizenVerification = (user) => ({
    id: user.id,
    name: user.name,
    email: user.email || "",
    phone: user.phone || "",
    ward: wardName(user.wardId),
    aadhaarLast4: user.aadhaarLast4 || "",
    aadhaarMasked: maskAadhaar(user.aadhaarLast4),
    aadhaarVerified: Boolean(user.aadhaarVerified),
    aadhaarVerifiedAt: user.aadhaarVerifiedAt || null,
    aadhaarSubmittedAt: user.aadhaarSubmittedAt || null,
    verificationStatus: user.verificationStatus || AADHAAR_STATUS.PENDING,
    verificationRemarks: user.verificationRemarks || "",
    createdAt: user.createdAt,
  });

  const listCitizenVerifications = async ({ status = "", search = "" } = {}, actor) => {
    requireAdmin(actor);
    const term = String(search || "").trim().toLowerCase();

    const items = users()
      .filter((user) => user.role === ROLES.USER)
      .filter((user) =>
        status ? (user.verificationStatus || AADHAAR_STATUS.PENDING) === status : true
      )
      .filter((user) =>
        term
          ? [
              user.name,
              user.email,
              user.phone,
              user.aadhaarLast4,
              wardName(user.wardId),
            ]
              .join(" ")
              .toLowerCase()
              .includes(term)
          : true
      )
      .map(toCitizenVerification)
      .sort((left, right) => {
        const rank = { Pending: 0, Rejected: 1, Verified: 2 };
        const difference =
          (rank[left.verificationStatus] ?? 3) - (rank[right.verificationStatus] ?? 3);
        if (difference !== 0) return difference;
        return new Date(right.aadhaarSubmittedAt || right.createdAt) -
          new Date(left.aadhaarSubmittedAt || left.createdAt);
      });

    return { items, total: items.length, page: 1, pages: 1, limit: items.length || 1 };
  };

  const reviewCitizenVerification = async ({ userId, decision, remarks } = {}, actor) => {
    const admin = requireAdmin(actor);
    const cleanDecision = oneOf(
      String(decision || ""),
      [AADHAAR_STATUS.VERIFIED, AADHAAR_STATUS.REJECTED],
      "verification decision"
    );
    const cleanRemarks = optionalText(remarks, { field: "Remarks", max: 500 });

    if (cleanDecision === AADHAAR_STATUS.REJECTED && !cleanRemarks) {
      throw new AppError(
        ERROR_CODES.VALIDATION,
        "Add a remark explaining why the Aadhaar verification was rejected."
      );
    }

    const list = users();
    const record = list.find((user) => user.id === userId);

    if (!record || record.role !== ROLES.USER) {
      throw new AppError(ERROR_CODES.NOT_FOUND, "That resident account could not be found.");
    }

    const approved = cleanDecision === AADHAAR_STATUS.VERIFIED;
    const now = new Date().toISOString();

    record.verificationStatus = cleanDecision;
    record.aadhaarVerified = approved;
    record.aadhaarVerifiedAt = approved ? now : null;
    record.verificationRemarks = cleanRemarks;
    record.verificationAudit = [
      ...(record.verificationAudit || []),
      {
        action: approved ? "aadhaar.verified" : "aadhaar.rejected",
        result: cleanDecision,
        remarks: cleanRemarks,
        last4: record.aadhaarLast4 || "",
        by: admin.name,
        at: now,
      },
    ];

    write(COLLECTIONS.users, list);

    notify(record.id, {
      title: approved ? "Aadhaar verification approved" : "Aadhaar verification rejected",
      body: approved
        ? "Your identity is verified. You can now submit complaints."
        : `Your Aadhaar verification was rejected.${cleanRemarks ? ` Reason: ${cleanRemarks}` : ""} You can update and resubmit it from your profile.`,
    });

    return {
      user: toPublicUser(record),
      message: approved
        ? `${record.name}'s Aadhaar verification was approved.`
        : `${record.name}'s Aadhaar verification was rejected.`,
    };
  };

  const listVerificationAudit = async ({ userId } = {}, actor) => {
    requireAdmin(actor);
    const record = users().find((user) => user.id === userId);

    if (!record || record.role !== ROLES.USER) {
      throw new AppError(ERROR_CODES.NOT_FOUND, "That resident account could not be found.");
    }

    return {
      userId: record.id,
      items: [...(record.verificationAudit || [])]
        .sort((left, right) => new Date(right.at) - new Date(left.at))
        .map((entry, index) => ({
          id: `${record.id}:${index}`,
          action: entry.action,
          result: entry.result || AADHAAR_STATUS.PENDING,
          remarks: entry.remarks || "",
          last4: entry.last4 || record.aadhaarLast4 || "",
          by: entry.by || "System",
          at: entry.at,
        })),
    };
  };

  /* -------------------------------- wards ------------------------------ */

  const listWards = async (_args, actor) => ({
    items: wards().map((ward) => ({
      ...ward,
      representative: representativeName(ward.representativeId),
      assignedOfficer: ward.assignedOfficerId
        ? officerName(ward.assignedOfficerId)
        : "",
      assignedOfficerCode: officerRecord(ward.assignedOfficerId)?.employeeCode || "",
      complaints: complaints().filter((complaint) => complaint.wardId === ward.id).length,
      resolved: complaints().filter(
        (complaint) => complaint.wardId === ward.id && complaint.status === STATUS.RESOLVED
      ).length,
      assigned: Boolean(actor && actor.role === ROLES.ADMIN),
    })),
  });

  const saveWard = async (ward = {}, actor) => {
    requireAdmin(actor);
    const list = wards();
    const name = requiredText(ward.name, { field: "Ward name", min: 2, max: 40 });
    const area = requiredText(ward.area, { field: "Area", min: 2, max: 60 });
    const zone = oneOf(ward.zone || "Central", ["North", "South", "East", "West", "Central"], "zone");

    const center = Array.isArray(ward.center) && ward.center.length === 2
      ? ward.center.map(Number)
      : null;
    if (!center || center.some((value) => !Number.isFinite(value))) {
      throw new AppError(ERROR_CODES.VALIDATION, "Ward coordinates are invalid.");
    }

    const duplicate = list.some(
      (item) => item.id !== ward.id && item.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) throw new AppError(ERROR_CODES.CONFLICT, "A ward with that name already exists.");

    const assignedOfficer =
      ward.assignedOfficerId &&
      officers().find(
        (officer) => officer.id === ward.assignedOfficerId && officer.isActive !== false
      );

    if (ward.assignedOfficerId && !assignedOfficer) {
      throw new AppError(ERROR_CODES.VALIDATION, "Choose an active sanitation officer.");
    }

    const assignedOfficerId = assignedOfficer?.id || "";

    if (ward.id) {
      const record = list.find((item) => item.id === ward.id);
      if (!record) throw new AppError(ERROR_CODES.NOT_FOUND, "That ward could not be found.");
      Object.assign(record, {
        name,
        area,
        zone,
        center,
        representativeId: ward.representativeId || "",
        assignedOfficerId,
      });
      write(COLLECTIONS.wards, list);
      return { ward: record, message: "Ward updated." };
    }

    const created = {
      id: `ward-${Date.now().toString(36)}`,
      name,
      area,
      zone,
      center,
      representativeId: ward.representativeId || "",
      assignedOfficerId,
    };

    write(COLLECTIONS.wards, [...list, created]);
    return { ward: created, message: "Ward added." };
  };

  const deleteWard = async ({ id } = {}, actor) => {
    requireAdmin(actor);
    const inUse = complaints().filter((complaint) => complaint.wardId === id).length;

    if (inUse > 0) {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        `This ward has ${inUse} complaint(s). Reassign them before deleting it.`
      );
    }

    const list = wards();
    if (!list.some((ward) => ward.id === id)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, "That ward could not be found.");
    }

    write(COLLECTIONS.wards, list.filter((ward) => ward.id !== id));
    write(
      COLLECTIONS.representatives,
      representatives().map((person) =>
        person.wardId === id ? { ...person, wardId: "" } : person
      )
    );

    return { message: "Ward removed." };
  };

  /* --------------------------- representatives ------------------------- */

  const listRepresentatives = async (_args) => ({
    items: representatives().map((person) => ({
      ...person,
      ward: wardName(person.wardId),
      complaints: complaints().filter((complaint) => complaint.representativeId === person.id)
        .length,
    })),
  });

  const saveRepresentative = async (person = {}, actor) => {
    requireAdmin(actor);
    const list = representatives();

    const clean = {
      name: requiredText(person.name, { field: "Name", min: 2, max: 60 }),
      designation: optionalText(person.designation, { field: "Designation", max: 60 }) || "Ward Corporator",
      phone: phoneNumber(person.phone),
      email: person.email ? emailAddress(person.email) : "",
      mlaName: optionalText(person.mlaName, { field: "MLA name", max: 80 }),
      officeAddress: optionalText(person.officeAddress, { field: "Office address", max: 200 }),
      wardId: wards().some((ward) => ward.id === person.wardId) ? String(person.wardId) : "",
    };

    if (person.id) {
      const record = list.find((item) => item.id === person.id);
      if (!record) throw new AppError(ERROR_CODES.NOT_FOUND, "That representative could not be found.");
      Object.assign(record, clean);
      write(COLLECTIONS.representatives, list);
      return { representative: record, message: "Representative updated." };
    }

    const created = { id: uid("rep"), ...clean };
    write(COLLECTIONS.representatives, [...list, created]);
    return { representative: created, message: "Representative added." };
  };

  const deleteRepresentative = async ({ id } = {}, actor) => {
    requireAdmin(actor);
    const list = representatives();

    if (!list.some((person) => person.id === id)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, "That representative could not be found.");
    }

    write(COLLECTIONS.representatives, list.filter((person) => person.id !== id));
    write(
      COLLECTIONS.complaints,
      complaints().map((complaint) =>
        complaint.representativeId === id
          ? { ...complaint, representativeId: "" }
          : complaint
      )
    );
    write(
      COLLECTIONS.wards,
      wards().map((ward) => (ward.representativeId === id ? { ...ward, representativeId: "" } : ward))
    );

    return { message: "Representative removed." };
  };

  /* --------------------------- notifications --------------------------- */

  const listNotifications = async (_args, actor) => {
    const user = requireUser(actor);
    const mine = notifications()
      .filter((item) => item.userId === user.id)
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

    return {
      items: mine,
      unread: mine.filter((item) => !item.read).length,
    };
  };

  const markNotificationsRead = async ({ id } = {}, actor) => {
    const user = requireUser(actor);
    write(
      COLLECTIONS.notifications,
      notifications().map((item) =>
        item.userId === user.id && (!id || item.id === id) ? { ...item, read: true } : item
      )
    );

    return { message: id ? "Marked as read." : "All notifications marked as read." };
  };

  const broadcastNotification = async ({ title, body, wardId } = {}, actor) => {
    const admin = requireAdmin(actor);
    const cleanTitle = requiredText(title, { field: "Title", min: 3, max: 80 });
    const cleanBody = requiredText(body, { field: "Message", min: 3, max: 300 });

    let audience = users().filter(
      (user) => user.role === ROLES.USER && user.status === USER_STATUS.ACTIVE
    );
    if (wardId) audience = audience.filter((user) => user.wardId === wardId);

    audience.forEach((user) =>
      notify(user.id, { title: cleanTitle, body: cleanBody, type: "broadcast" })
    );

    // Keep a copy in the sending administrator's own history so the
    // "recent notifications" panel can show what was announced.
    notify(admin.id, { title: cleanTitle, body: cleanBody, type: "broadcast" });

    return { message: `Sent to ${audience.length} resident(s).`, recipients: audience.length };
  };

  /* ------------------------------ settings ----------------------------- */

  const getSettings = async () => ({ settings: settings() });

  const listEmailOutbox = async ({ limit = 100 } = {}, actor) => {
    requireAdmin(actor);
    return { items: read(COLLECTIONS.emails, []).slice(0, Math.max(1, Math.min(Number(limit) || 100, 500))) };
  };

  const saveSettings = async (patch = {}, actor) => {
    requireAdmin(actor);
    const current = settings();
    const next = { ...current };

    if (patch.cityName !== undefined) {
      next.cityName = requiredText(patch.cityName, { field: "City name", min: 2, max: 40 });
    }
    if (patch.department !== undefined) {
      next.department = requiredText(patch.department, { field: "Department", min: 2, max: 80 });
    }
    if (patch.supportEmail !== undefined) next.supportEmail = emailAddress(patch.supportEmail);
    if (patch.slaDays !== undefined) {
      const sla = Number(patch.slaDays);
      if (!Number.isFinite(sla) || sla < 1 || sla > 30) {
        throw new AppError(ERROR_CODES.VALIDATION, "SLA must be between 1 and 30 days.");
      }
      next.slaDays = Math.round(sla);
    }
    if (patch.autoAssignWard !== undefined) next.autoAssignWard = Boolean(patch.autoAssignWard);
    if (patch.allowRegistration !== undefined) next.allowRegistration = Boolean(patch.allowRegistration);
    if (patch.notifyOnNewComplaint !== undefined) {
      next.notifyOnNewComplaint = Boolean(patch.notifyOnNewComplaint);
    }
    if (patch.emailNotifications !== undefined) {
      next.emailNotifications = Boolean(patch.emailNotifications);
    }
    if (patch.emailTemplates && typeof patch.emailTemplates === "object") {
      next.emailTemplates = {
        ...(next.emailTemplates || {}),
        ...Object.fromEntries(
          Object.entries(patch.emailTemplates)
            .filter(([key]) => EMAIL_TEMPLATES[key])
            .map(([key, entry]) => [
              key,
              {
                subject: String(entry?.subject || "").slice(0, 200),
                body: String(entry?.body || "").slice(0, 4000),
              },
            ])
        ),
      };
    }

    write(COLLECTIONS.settings, next);
    return { settings: next, message: "Settings saved." };
  };

  /* -------------------------------- api -------------------------------- */

  const methods = {
    register,
    login,
    adminLogin,
    officerLogin,
    me,
    updateProfile,
    submitAadhaar,
    changePassword,
    listComplaints,
    getComplaint,
    createComplaint,
    upvoteComplaint,
    addComment,
    updateComplaintStatus,
    updateComplaintWork,
    acceptComplaint,
    assignComplaint,
    verifyComplaint,
    checkDuplicates,
    myStats,
    analytics,
    listUsers,
    setUserStatus,
    listCitizenVerifications,
    reviewCitizenVerification,
    listVerificationAudit,
    listOfficers,
    officerProfile,
    officerDashboard,
    listOfficerComplaints: (args, actor) => listComplaints(args, actor),
    getOfficerComplaint: ({ id }, actor) => getComplaint({ id }, actor),
    updateOfficerStatus,
    resolveOfficerComplaint: (args, actor) =>
      updateOfficerStatus({ ...args, status: STATUS.RESOLVED }, actor),
    updateOfficerWork,
    listWards,
    saveWard,
    deleteWard,
    listRepresentatives,
    saveRepresentative,
    deleteRepresentative,
    listNotifications,
    markNotificationsRead,
    broadcastNotification,
    getSettings,
    saveSettings,
    listEmailOutbox,
  };

  let readyPromise = null;
  const init = () => {
    readyPromise = readyPromise || ensureSeeded();
    return readyPromise;
  };

  const service = { init };

  // Every public method waits for first-run seeding without repeating it.
  Object.entries(methods).forEach(([name, method]) => {
    service[name] = async (args, actor) => {
      await init();
      return method(args, actor);
    };
  });

  return service;
}

export const SERVICE_METHODS = [
  "register",
  "login",
  "adminLogin",
  "officerLogin",
  "me",
  "updateProfile",
  "submitAadhaar",
  "changePassword",
  "listComplaints",
  "getComplaint",
  "createComplaint",
  "upvoteComplaint",
  "addComment",
  "updateComplaintStatus",
  "updateComplaintWork",
  "acceptComplaint",
  "assignComplaint",
  "verifyComplaint",
  "checkDuplicates",
  "myStats",
  "analytics",
  "listUsers",
  "setUserStatus",
  "listCitizenVerifications",
  "reviewCitizenVerification",
  "listVerificationAudit",
  "listOfficers",
  "officerProfile",
  "officerDashboard",
  "listOfficerComplaints",
  "getOfficerComplaint",
  "updateOfficerStatus",
  "resolveOfficerComplaint",
  "updateOfficerWork",
  "listWards",
  "saveWard",
  "deleteWard",
  "listRepresentatives",
  "saveRepresentative",
  "deleteRepresentative",
  "listNotifications",
  "markNotificationsRead",
  "broadcastNotification",
  "getSettings",
  "saveSettings",
  "listEmailOutbox",
];
