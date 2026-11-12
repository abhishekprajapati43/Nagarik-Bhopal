import crypto from "node:crypto";
import { GARBAGE_CATEGORY_ID, WASTE_TYPES } from "../../shared/constants.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * Optional AI waste detection.
 *
 * The app must keep working when no model is configured, so this module always
 * answers: a remote classifier is used when WASTE_AI_URL is set, otherwise a
 * deterministic heuristic reads the selected category/issue. Callers treat the
 * result as advisory metadata only and never block complaint submission.
 */

const KEYWORDS = [
  [/plastic|polythene|bottle/i, "Plastic"],
  [/electronic|e-waste|ewaste|battery|appliance/i, "E-Waste"],
  [/construction|debris|rubble|malba/i, "Construction Waste"],
  [/dead animal|carcass/i, "Dead Animal"],
  [/wet|kitchen|organic|food/i, "Wet Waste"],
  [/dry|paper|cardboard|metal|glass/i, "Dry Waste"],
];

const heuristic = ({ complaintCategory, complaintType, description }) => {
  const haystack = [complaintType, description].filter(Boolean).join(" ");

  for (const [pattern, wasteType] of KEYWORDS) {
    if (pattern.test(haystack)) {
      return { wasteType, confidence: 0.82 };
    }
  }

  if (complaintCategory === GARBAGE_CATEGORY_ID) {
    return { wasteType: "Mixed Waste", confidence: 0.64 };
  }

  return { wasteType: "", confidence: 0 };
};

const remote = async ({ image }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(env.wasteAi.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.wasteAi.key ? { Authorization: `Bearer ${env.wasteAi.key}` } : {}),
      },
      body: JSON.stringify({ image }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`AI endpoint responded ${response.status}`);

    const payload = await response.json();
    const wasteType = String(payload.wasteType || payload.label || "").trim();
    const confidence = Number(payload.confidence ?? payload.score ?? 0);

    if (!wasteType || !Number.isFinite(confidence)) {
      throw new Error("AI endpoint returned an unexpected payload");
    }

    return {
      wasteType: WASTE_TYPES.includes(wasteType) ? wasteType : wasteType.slice(0, 40),
      confidence: Math.max(0, Math.min(1, confidence)),
      provider: "remote",
    };
  } finally {
    clearTimeout(timer);
  }
};

/** SHA-256 fingerprint of the image payload; used for duplicate detection. */
export const fingerprint = (image) => {
  const value = String(image || "");
  if (!value) return "";
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
};

export const detectWaste = async ({
  image = "",
  complaintCategory = "",
  complaintType = "",
  description = "",
} = {}) => {
  if (!image) {
    return { available: false, wasteType: "", confidence: 0, provider: "none" };
  }

  if (env.wasteAi.enabled) {
    try {
      const result = await remote({ image });
      return { available: true, ...result };
    } catch (error) {
      logger.warn("Waste AI unavailable, using heuristic", { error: error.message });
    }
  }

  const result = heuristic({ complaintCategory, complaintType, description });
  return {
    available: result.confidence > 0,
    wasteType: result.wasteType,
    confidence: result.confidence,
    provider: "heuristic",
  };
};

export default { detectWaste, fingerprint };
