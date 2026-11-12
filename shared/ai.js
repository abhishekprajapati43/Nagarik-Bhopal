import { GARBAGE_CATEGORY_ID, WASTE_TYPES } from "./constants.js";

/**
 * Browser-side companion to the server classifier.
 *
 * It gives citizens instant, advisory feedback after choosing a photo. The
 * server re-runs the same heuristic (or a configured model) when the complaint
 * is submitted, so the UI prediction is never trusted blindly and a missing
 * prediction never blocks submission.
 */

const KEYWORDS = [
  [/plastic|polythene|bottle/i, "Plastic"],
  [/electronic|e-waste|ewaste|battery|appliance/i, "E-Waste"],
  [/construction|debris|rubble|malba/i, "Construction Waste"],
  [/dead animal|carcass/i, "Dead Animal"],
  [/wet|kitchen|organic|food/i, "Wet Waste"],
  [/dry|paper|cardboard|metal|glass/i, "Dry Waste"],
];

export function detectWaste({ complaintCategory = "", complaintType = "", description = "" } = {}) {
  const haystack = [complaintType, description].filter(Boolean).join(" ");

  for (const [pattern, wasteType] of KEYWORDS) {
    if (pattern.test(haystack)) {
      return { available: true, wasteType, confidence: 0.82, provider: "heuristic" };
    }
  }

  if (complaintCategory === GARBAGE_CATEGORY_ID) {
    return { available: true, wasteType: "Mixed Waste", confidence: 0.64, provider: "heuristic" };
  }

  return { available: false, wasteType: "", confidence: 0, provider: "heuristic" };
}

export const validWasteType = (value) => WASTE_TYPES.includes(value);

/** Small deterministic fingerprint used for image-similarity duplicate checks. */
export function imageFingerprint(image) {
  const value = String(image || "");
  if (!value) return "";

  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return `fnv1a-${hash.toString(16).padStart(8, "0")}-${value.length.toString(16)}`;
}

export default { detectWaste, imageFingerprint, validWasteType };
