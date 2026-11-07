const COMPLAINTS_KEY = "nagarik-complaints";

export const getUser = () => {
  try {
    const user = localStorage.getItem("user");
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
};

export const getToken = () => localStorage.getItem("token");

export const clearStorage = () => {
  localStorage.clear();
};

export const seedComplaints = [
  {
    id: 1,
    image: "https://picsum.photos/400/250?1",
    wasteType: "Mixed Waste",
    address: "MP Nagar Zone-1, Bhopal",
    ward: "Ward 35",
    representative: "Mr. Rajesh Sharma",
    mla: "Bhopal South",
    days: 4,
    status: "Pending",
    description: "Garbage has been lying at the corner for several days and is starting to smell.",
    position: [23.2599, 77.4126],
  },
  {
    id: 2,
    image: "https://picsum.photos/400/250?2",
    wasteType: "Plastic Waste",
    address: "Ashoka Garden, Bhopal",
    ward: "Ward 12",
    representative: "Ms. Sunita Verma",
    mla: "Bhopal North",
    days: 1,
    status: "Resolved",
    description: "Plastic dumped beside the community bin. The sweepers cleared it after a report.",
    position: [23.25, 77.46],
  },
  {
    id: 3,
    image: "https://picsum.photos/400/250?3",
    wasteType: "Construction Waste",
    address: "New Market, Bhopal",
    ward: "Ward 40",
    representative: "Mr. Imran Khan",
    mla: "Bhopal Central",
    days: 7,
    status: "In-Progress",
    description: "Construction debris blocking half of the footpath near the market entrance.",
    position: [23.2335, 77.4345],
  },
];

const readStored = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(COMPLAINTS_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
};

const pendingDays = (createdAt) => {
  if (!createdAt) return 0;
  const elapsed = Date.now() - new Date(createdAt).getTime();
  return Math.max(0, Math.floor(elapsed / 86400000));
};

/** Complaints reported in this browser first, then the demo seeds. */
export const getComplaints = () => {
  const reported = readStored().map((complaint) => ({
    ...complaint,
    days: pendingDays(complaint.createdAt),
  }));

  return [...reported, ...seedComplaints];
};

export const getComplaint = (id) =>
  getComplaints().find((complaint) => String(complaint.id) === String(id)) || null;

export const addComplaint = (complaint) => {
  const created = {
    ...complaint,
    id: `c${Date.now()}`,
    status: "Pending",
    createdAt: new Date().toISOString(),
  };

  const stored = readStored();

  try {
    localStorage.setItem(COMPLAINTS_KEY, JSON.stringify([created, ...stored]));
  } catch {
    // A photo can exceed the storage quota; keep the report without it.
    localStorage.setItem(
      COMPLAINTS_KEY,
      JSON.stringify([{ ...created, image: "" }, ...stored])
    );
  }

  return created;
};
