import {
  GARBAGE_CATEGORY_ID,
  complaintCategoryLabel,
  findCategoryForIssue,
  findComplaintCategory,
} from "../shared/constants";

/**
 * Display helpers that keep legacy complaints (only a `wasteType`) rendering
 * next to new category-aware records.
 */

export const complaintCategoryId = (complaint = {}) => {
  const explicit = findComplaintCategory(complaint.complaintCategory);
  if (explicit) return explicit.id;

  const inferred =
    findCategoryForIssue(complaint.complaintType) || findCategoryForIssue(complaint.wasteType);

  return inferred?.id || GARBAGE_CATEGORY_ID;
};

export const complaintTypeLabel = (complaint = {}) =>
  complaint.complaintType || complaint.wasteType || "Civic issue";

export const complaintCategoryName = (complaint = {}) =>
  complaint.complaintCategoryLabel || complaintCategoryLabel(complaintCategoryId(complaint));

export default {
  complaintCategoryId,
  complaintTypeLabel,
  complaintCategoryName,
};
