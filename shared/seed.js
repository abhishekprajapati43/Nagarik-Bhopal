import {
  DEMO_ADMIN,
  DEMO_OFFICER,
  DEFAULT_SETTINGS,
  GARBAGE_CATEGORY_ID,
  ROLES,
  STATUS,
  WARDS,
} from "./constants.js";

/**
 * First-run data. Seeds wards, representatives, a demo citizen, the admin
 * account and a handful of complaints so every screen has something to show.
 */

const DAY = 86_400_000;

const representatives = [
  { id: "rep-1", name: "Mr. Rajesh Sharma", designation: "Ward Corporator", phone: "+91 98765 43210", email: "rajesh.sharma@nagarik.bhopal", wardId: "ward-35", mlaName: "Shri Rameshwar Sharma", officeAddress: "Ward Office, Zone-1, MP Nagar, Bhopal" },
  { id: "rep-2", name: "Ms. Sunita Verma", designation: "Ward Corporator", phone: "+91 98260 11223", email: "sunita.verma@nagarik.bhopal", wardId: "ward-12", mlaName: "Smt. Aruna Verma", officeAddress: "Ward Office, Ashoka Garden, Bhopal" },
  { id: "rep-3", name: "Mr. Imran Khan", designation: "Ward Corporator", phone: "+91 90000 88221", email: "imran.khan@nagarik.bhopal", wardId: "ward-40", mlaName: "Shri Salman Khan", officeAddress: "Ward Office, New Market, Bhopal" },
  { id: "rep-4", name: "Ms. Kavita Yadav", designation: "Sanitation Officer", phone: "+91 91111 44556", email: "kavita.yadav@nagarik.bhopal", wardId: "ward-25", mlaName: "Shri Mahesh Yadav", officeAddress: "Ward Office, Kolar Road, Bhopal" },
  { id: "rep-5", name: "Mr. Deepak Sahu", designation: "Zone Supervisor", phone: "+91 93333 77889", email: "deepak.sahu@nagarik.bhopal", wardId: "ward-44", mlaName: "Shri Govind Sahu", officeAddress: "Zone Office, Govindpura, Bhopal" },
];

const complaintSeeds = [
  {
    id: "1",
    wasteType: "Mixed Waste",
    address: "MP Nagar Zone-1, Bhopal",
    wardId: "ward-35",
    description: "Garbage has been lying at the corner for several days and is starting to smell.",
    image: "https://picsum.photos/400/250?1",
    position: [23.2599, 77.4126],
    status: STATUS.PENDING,
    priority: "High",
    daysAgo: 4,
    upvotes: 7,
  },
  {
    id: "2",
    wasteType: "Plastic",
    address: "Ashoka Garden, Bhopal",
    wardId: "ward-12",
    description: "Plastic dumped beside the community bin. The sweepers cleared it after a report.",
    image: "https://picsum.photos/400/250?2",
    position: [23.25, 77.46],
    status: STATUS.RESOLVED,
    priority: "Medium",
    daysAgo: 9,
    resolvedAfterDays: 2,
    upvotes: 3,
    assignedOfficerId: "officer-1",
    verificationStatus: "pending",
  },
  {
    id: "3",
    wasteType: "Construction Waste",
    address: "New Market, Bhopal",
    wardId: "ward-40",
    description: "Construction debris blocking half of the footpath near the market entrance.",
    image: "https://picsum.photos/400/250?3",
    position: [23.2335, 77.4345],
    status: STATUS.IN_PROGRESS,
    priority: "High",
    daysAgo: 7,
    upvotes: 11,
    assignedOfficerId: "officer-1",
  },
  {
    id: "4",
    wasteType: "Wet Waste",
    address: "Kolar Road, near Durga Chowk, Bhopal",
    wardId: "ward-25",
    description: "Vegetable waste is piling up behind the market and attracting stray animals.",
    image: "https://picsum.photos/400/250?4",
    position: [23.1803, 77.4204],
    status: STATUS.PENDING,
    priority: "Medium",
    daysAgo: 2,
    upvotes: 5,
  },
  {
    id: "5",
    wasteType: "E-Waste",
    address: "Govindpura Industrial Area, Bhopal",
    wardId: "ward-44",
    description: "Old computer parts dumped on the roadside by an unknown shop.",
    image: "https://picsum.photos/400/250?5",
    position: [23.2712, 77.4402],
    status: STATUS.REJECTED,
    priority: "Low",
    daysAgo: 12,
    upvotes: 1,
  },
];

const wardById = (wardId) => WARDS.find((ward) => ward.id === wardId);
const representativeForWard = (wardId) =>
  representatives.find((person) => person.wardId === wardId) || null;

export async function buildSeed({ hashPassword, now = Date.now() }) {
  const iso = (offsetDays) => new Date(now - offsetDays * DAY).toISOString();

  const admin = {
    id: "u-admin",
    name: DEMO_ADMIN.name,
    email: DEMO_ADMIN.email,
    phone: "+91 755 555 0100",
    wardId: "",
    role: ROLES.ADMIN,
    status: "active",
    passwordHash: await hashPassword(DEMO_ADMIN.password),
    createdAt: iso(120),
  };

  const citizen = {
    id: "u-citizen",
    name: "Asha Verma",
    email: "citizen@nagarik.bhopal",
    phone: "+91 98111 22334",
    wardId: "ward-35",
    role: ROLES.USER,
    status: "active",
    passwordHash: await hashPassword("Citizen@123"),
    // Grandfathered demo identity. No real Aadhaar number is stored.
    aadhaarLast4: "1234",
    aadhaarVerified: true,
    aadhaarVerifiedAt: iso(39),
    aadhaarSubmittedAt: iso(40),
    verificationStatus: "Verified",
    verificationRemarks: "Demo resident verified before the Aadhaar rollout.",
    createdAt: iso(40),
  };

  const officerUser = {
    id: "u-officer",
    name: DEMO_OFFICER.name,
    email: DEMO_OFFICER.email,
    phone: DEMO_OFFICER.phone,
    wardId: "ward-25",
    role: ROLES.OFFICER,
    status: "active",
    passwordHash: await hashPassword(DEMO_OFFICER.password),
    createdAt: iso(60),
  };

  const officerRecords = [
    {
      id: "officer-1",
      userId: officerUser.id,
      employeeCode: DEMO_OFFICER.employeeCode,
      designation: "Sanitation Officer",
      zone: DEMO_OFFICER.zone,
      phone: DEMO_OFFICER.phone,
      isActive: true,
      createdAt: iso(60),
    },
  ];

  const complaints = complaintSeeds.map((seed) => {
    const ward = wardById(seed.wardId);
    const representative = representativeForWard(seed.wardId);
    const createdAt = iso(seed.daysAgo);

    const timeline = [
      { status: STATUS.PENDING, at: createdAt, by: citizen.name, note: "Complaint submitted." },
    ];

    if (seed.assignedOfficerId && seed.status !== STATUS.PENDING) {
      timeline.push({
        status: STATUS.ASSIGNED,
        at: iso(seed.daysAgo - 0.5),
        by: admin.name,
        note: `Assigned to ${officerUser.name}.`,
      });
    }

    if (seed.status !== STATUS.PENDING) {
      timeline.push({
        status: seed.status,
        at: iso(seed.daysAgo - (seed.resolvedAfterDays ?? 1)),
        by: seed.assignedOfficerId ? officerUser.name : admin.name,
        note:
          seed.status === STATUS.RESOLVED
            ? "Site cleaned by the sanitation team. Awaiting citizen verification."
            : seed.status === STATUS.REJECTED
              ? "Duplicate of an existing report; closed."
              : "Team assigned and work started.",
      });
    }

    return {
      id: seed.id,
      userId: citizen.id,
      userName: citizen.name,
      userEmail: citizen.email,
      wasteType: seed.wasteType,
      complaintCategory: GARBAGE_CATEGORY_ID,
      complaintType: seed.wasteType,
      description: seed.description,
      address: seed.address,
      wardId: seed.wardId,
      ward: ward?.name ?? "Unassigned",
      representativeId: representative?.id ?? "",
      representative: representative?.name ?? "Not assigned",
      assignedOfficerId: seed.assignedOfficerId ?? "",
      status: seed.status,
      priority: seed.priority,
      image: seed.image,
      beforePhoto: "",
      afterPhoto: "",
      workNotes: seed.assignedOfficerId ? "Sanitation team visited the site." : "",
      verificationStatus: seed.verificationStatus ?? "not_requested",
      position: seed.position,
      // Keep the community support figures the seed file documents.
      upvotedBy: Array.from(
        { length: Number(seed.upvotes) || 0 },
        (_, index) => `seed-voter-${seed.id}-${index}`
      ),
      comments:
        seed.id === "1"
          ? [
              { id: "cm-1", userId: "u-public-1", userName: "Rahul", text: "Garbage is still there.", createdAt: iso(3) },
              { id: "cm-2", userId: "u-public-2", userName: "Ankit", text: "Please clean this area.", createdAt: iso(2) },
            ]
          : [],
      timeline,
      statusHistory: timeline.map((entry, index) => ({
        from: index === 0 ? "" : timeline[index - 1].status,
        to: entry.status,
        note: entry.note,
        by: entry.by,
        role:
          entry.by === admin.name
            ? ROLES.ADMIN
            : entry.by === officerUser.name
              ? ROLES.OFFICER
              : ROLES.USER,
        at: entry.at,
      })),
      createdAt,
      updatedAt: timeline[timeline.length - 1].at,
    };
  });

  return {
    users: [admin, citizen, officerUser],
    officers: officerRecords,
    wards: WARDS.map((ward) => {
      const representative = representativeForWard(ward.id);
      return {
        ...ward,
        representativeId: representative?.id ?? "",
        assignedOfficerId: ward.assignedOfficerId ?? "",
      };
    }),
    representatives,
    complaints,
    notifications: [
      {
        id: "n-1",
        userId: citizen.id,
        title: "Welcome to Nagarik Bhopal",
        body: "Track your reports, upvote issues around you and follow the fix.",
        type: "system",
        complaintId: "",
        read: false,
        createdAt: iso(1),
      },
      {
        id: "n-2",
        userId: citizen.id,
        title: "Complaint #2 resolved",
        body: "Plastic Waste at Ashoka Garden has been marked resolved.",
        type: "status",
        complaintId: "2",
        read: false,
        createdAt: iso(7),
      },
    ],
    settings: { ...DEFAULT_SETTINGS },
    meta: { seededAt: new Date(now).toISOString(), version: 1 },
  };
}
