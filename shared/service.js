import {
  DEFAULT_SETTINGS,
  DEMO_JWT_SECRET,
  ROLES,
  STATUS,
  STATUS_LIST,
  TOKEN_TTL_SECONDS,
  USER_STATUS,
  WARDS,
  WASTE_TYPES,
  findNearestWard,
} from "./constants.js";
import { AppError, ERROR_CODES } from "./errors.js";
import { signJwt, verifyJwt } from "./jwt.js";
import { hashPassword, verifyPassword } from "./password.js";
import { buildSeed } from "./seed.js";
import {
  commentText,
  complaintPayload,
  emailAddress,
  loginIdentifier,
  oneOf,
  optionalText,
  password as validatePassword,
  phoneDigits,
  phoneNumber,
  requiredText,
  statusValue,
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
  complaints: "complaints",
  wards: "wards",
  representatives: "representatives",
  notifications: "notifications",
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
  const complaints = () => read(COLLECTIONS.complaints, []);
  const wards = () => read(COLLECTIONS.wards, WARDS);
  const representatives = () => read(COLLECTIONS.representatives, []);
  const notifications = () => read(COLLECTIONS.notifications, []);
  const settings = () => ({ ...DEFAULT_SETTINGS, ...read(COLLECTIONS.settings, {}) });

  /* ------------------------------ seeding ------------------------------ */

  const ensureSeeded = async () => {
    const meta = read(COLLECTIONS.meta, null);
    if (meta?.seededAt) return;

    const seed = await buildSeed({ hashPassword });

    write(COLLECTIONS.users, seed.users);
    write(COLLECTIONS.wards, seed.wards);
    write(COLLECTIONS.representatives, seed.representatives);
    write(COLLECTIONS.complaints, seed.complaints);
    write(COLLECTIONS.notifications, seed.notifications);
    write(COLLECTIONS.settings, seed.settings);
    write(COLLECTIONS.meta, seed.meta);
  };

  /* ------------------------------ helpers ------------------------------ */

  const toPublicUser = (user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    wardId: user.wardId || "",
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
  });

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

  const toComplaintView = (complaint, actor) => {
    const finished = complaint.status === STATUS.RESOLVED || complaint.status === STATUS.REJECTED;
    const days = daysBetween(complaint.createdAt, finished ? complaint.updatedAt : Date.now());

    return {
      ...complaint,
      // `days` and `ward`/`representative` keep the existing cards and details
      // page working exactly as before.
      days,
      ward: wardName(complaint.wardId),
      representative: representativeName(complaint.representativeId),
      mla: `Bhopal ${wards().find((ward) => ward.id === complaint.wardId)?.zone || "Central"}`,
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

  const addTimeline = (complaint, { status, note, by }) => {
    const at = new Date().toISOString();
    complaint.timeline = [
      ...(complaint.timeline || []),
      { status, note: note || "", at, by: by || "System" },
    ];
    complaint.status = status;
    complaint.updatedAt = at;
  };

  const publicComplaintCount = (userId) =>
    complaints().filter((complaint) => complaint.userId === userId).length;

  /* ------------------------------- auth -------------------------------- */

  const register = async ({ name, email, password, phone, wardId } = {}) => {
    const settingsValue = settings();

    if (!settingsValue.allowRegistration) {
      throw new AppError(ERROR_CODES.FORBIDDEN, "New registrations are closed right now.");
    }

    const cleanName = requiredText(name, { field: "Name", min: 2, max: 60 });
    const cleanEmail = emailAddress(email);
    const cleanPassword = validatePassword(password);
    const cleanPhone = phoneNumber(phone);

    const list = users();
    if (list.some((person) => person.email === cleanEmail)) {
      throw new AppError(ERROR_CODES.EMAIL_TAKEN, "An account with this email already exists. Try signing in.");
    }

    const user = {
      id: uid("u"),
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      wardId: wardId ? String(wardId) : "",
      role: ROLES.USER,
      status: USER_STATUS.ACTIVE,
      passwordHash: await hashPassword(cleanPassword),
      createdAt: new Date().toISOString(),
    };

    list.push(user);
    write(COLLECTIONS.users, list);

    notify(user.id, {
      title: "Welcome to Nagarik Bhopal",
      body: "Report an issue, track progress and upvote problems around you.",
    });

    return { token: await issueToken(user), user: toPublicUser(user) };
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
      throw new AppError(
        ERROR_CODES.FORBIDDEN,
        expectedRole === ROLES.ADMIN
          ? "This account does not have administrator access."
          : "Administrators must use the admin sign-in page."
      );
    }

    return { token: await issueToken(user), user: toPublicUser(user) };
  };

  const login = (args) => loginWithRole(args, ROLES.USER);
  const adminLogin = (args) => loginWithRole(args, ROLES.ADMIN);

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

    if (query.scope === "mine") {
      const user = requireUser(actor);
      items = items.filter((complaint) => complaint.userId === user.id);
    }

    if (query.wasteType) items = items.filter((item) => item.wasteType === query.wasteType);
    if (query.wardId) items = items.filter((item) => item.wardId === query.wardId);

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
      items = items.filter((item) =>
        [item.id, item.address, item.description, item.wasteType, item.userName, wardName(item.wardId)]
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
    const view = toComplaintView(complaint, actor);

    view.comments = [...(complaint.comments || [])].sort(
      (left, right) => new Date(left.createdAt) - new Date(right.createdAt)
    );

    return { complaint: view };
  };

  const createComplaint = async (payload = {}, actor) => {
    const user = requireUser(actor);
    const clean = complaintPayload(payload);
    const settingsValue = settings();

    const userRecord = users().find((person) => person.id === user.id);
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
    const now = new Date().toISOString();

    const complaint = {
      id: uid("c"),
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      wasteType: clean.wasteType,
      description: clean.description,
      address: clean.address,
      wardId: detectedWard?.id || "",
      ward: detectedWard?.name || "Unassigned",
      representativeId: representative?.id || "",
      representative: representative?.name || "Not assigned",
      status: STATUS.PENDING,
      priority: clean.priority,
      image: clean.image,
      position: clean.position,
      upvotedBy: [],
      comments: [],
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

    write(COLLECTIONS.complaints, [complaint, ...complaints()]);

    notify(user.id, {
      title: `Complaint #${complaint.id.slice(-6)} received`,
      body: `${complaint.wasteType} at ${complaint.address} is now ${STATUS.PENDING.toLowerCase()}.`,
      type: "complaint",
      complaintId: complaint.id,
    });

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

  const updateComplaintStatus = async ({ id, status, note } = {}, actor) => {
    const admin = requireAdmin(actor);
    const cleanStatus = statusValue(status);
    const list = complaints();
    const complaint = list.find((item) => String(item.id) === String(id));

    if (!complaint) throw new AppError(ERROR_CODES.NOT_FOUND, `Complaint #${id} could not be found.`);
    if (complaint.status === cleanStatus) {
      throw new AppError(ERROR_CODES.CONFLICT, `This complaint is already marked ${cleanStatus}.`);
    }

    addTimeline(complaint, {
      status: cleanStatus,
      note: optionalText(note, { field: "Note", max: 200 }) || `Status changed to ${cleanStatus}.`,
      by: admin.name,
    });

    write(COLLECTIONS.complaints, list);

    notify(complaint.userId, {
      title: `Complaint update: ${cleanStatus}`,
      body: `${complaint.wasteType} at ${complaint.address} is now ${cleanStatus}.`,
      type: "status",
      complaintId: complaint.id,
    });

    return { complaint: toComplaintView(complaint, admin), message: `Marked ${cleanStatus}.` };
  };

  const assignComplaint = async ({ id, wardId, representativeId } = {}, actor) => {
    const admin = requireAdmin(actor);
    const list = complaints();
    const complaint = list.find((item) => String(item.id) === String(id));

    if (!complaint) throw new AppError(ERROR_CODES.NOT_FOUND, `Complaint #${id} could not be found.`);

    if (wardId !== undefined) {
      if (wardId === "") {
        complaint.wardId = "";
      } else {
        const ward = wards().find((item) => item.id === wardId);
        if (!ward) throw new AppError(ERROR_CODES.VALIDATION, "Choose a valid ward.");
        complaint.wardId = ward.id;
      }
    }

    if (representativeId !== undefined) {
      const person = representatives().find((item) => item.id === representativeId);
      complaint.representativeId = person?.id || "";
    }

    complaint.updatedAt = new Date().toISOString();
    write(COLLECTIONS.complaints, list);

    return {
      complaint: toComplaintView(complaint, admin),
      message: `Assigned to ${wardName(complaint.wardId)} · ${representativeName(complaint.representativeId)}.`,
    };
  };

  /* ------------------------------ analytics ---------------------------- */

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
    const resolved = mine.filter((complaint) => complaint.status === STATUS.RESOLVED);
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
      pending: byStatus[STATUS.PENDING] || 0,
      inProgress: byStatus[STATUS.IN_PROGRESS] || 0,
      resolved: byStatus[STATUS.RESOLVED] || 0,
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
    const resolved = all.filter((complaint) => complaint.status === STATUS.RESOLVED);

    const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(Date.now() - (6 - index) * DAY);
      const label = date.toLocaleDateString("en-IN", { weekday: "short" });
      const count = all.filter(
        (complaint) => new Date(complaint.createdAt).toDateString() === date.toDateString()
      ).length;
      return { label, value: count };
    });

    return {
      totals: {
        complaints: all.length,
        pending: byStatusCounts[STATUS.PENDING] || 0,
        inProgress: byStatusCounts[STATUS.IN_PROGRESS] || 0,
        resolved: byStatusCounts[STATUS.RESOLVED] || 0,
        rejected: byStatusCounts[STATUS.REJECTED] || 0,
        users: userList.length,
        blockedUsers: userList.filter((user) => user.status === USER_STATUS.BLOCKED).length,
        wards: wards().length,
        representatives: representatives().length,
        upvotes: all.reduce((total, complaint) => total + (complaint.upvotedBy?.length || 0), 0),
        resolutionRate: all.length ? Math.round((resolved.length / all.length) * 100) : 0,
        averageResolutionDays: resolved.length
          ? round(
              resolved.reduce(
                (total, complaint) => total + daysBetween(complaint.createdAt, complaint.updatedAt),
                0
              ) / resolved.length
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

  /* -------------------------------- wards ------------------------------ */

  const listWards = async (_args, actor) => ({
    items: wards().map((ward) => ({
      ...ward,
      representative: representativeName(ward.representativeId),
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

    if (ward.id) {
      const record = list.find((item) => item.id === ward.id);
      if (!record) throw new AppError(ERROR_CODES.NOT_FOUND, "That ward could not be found.");
      Object.assign(record, { name, area, zone, center, representativeId: ward.representativeId || "" });
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

    write(COLLECTIONS.settings, next);
    return { settings: next, message: "Settings saved." };
  };

  /* -------------------------------- api -------------------------------- */

  const methods = {
    register,
    login,
    adminLogin,
    me,
    updateProfile,
    changePassword,
    listComplaints,
    getComplaint,
    createComplaint,
    upvoteComplaint,
    addComment,
    updateComplaintStatus,
    assignComplaint,
    myStats,
    analytics,
    listUsers,
    setUserStatus,
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
  "me",
  "updateProfile",
  "changePassword",
  "listComplaints",
  "getComplaint",
  "createComplaint",
  "upvoteComplaint",
  "addComment",
  "updateComplaintStatus",
  "assignComplaint",
  "myStats",
  "analytics",
  "listUsers",
  "setUserStatus",
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
];
