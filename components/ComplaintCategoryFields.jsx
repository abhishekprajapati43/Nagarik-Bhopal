import {
  COMPLAINT_CATEGORIES,
  complaintIssueOptions,
  findComplaintCategory,
} from "../shared/constants";

/**
 * Two-step category → issue selector shared by the report form and the
 * dashboard/admin filters. `CategorySelect` and `IssueSelect` can be used on
 * their own when a parent needs its own labels or layout.
 */

export function CategorySelect({
  value = "",
  onChange,
  id,
  disabled = false,
  required = false,
  allLabel = "All categories",
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      required={required}
      aria-label={required ? "Complaint category" : allLabel}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{required ? "Select category" : allLabel}</option>
      {COMPLAINT_CATEGORIES.map((category) => (
        <option key={category.id} value={category.id}>
          {category.label}
        </option>
      ))}
    </select>
  );
}

export function IssueSelect({
  category = "",
  value = "",
  onChange,
  id,
  disabled = false,
  required = false,
  allLabel = "All issue types",
}) {
  const categoryInfo = findComplaintCategory(category);
  const options = complaintIssueOptions(categoryInfo?.id);

  return (
    <select
      id={id}
      value={value}
      disabled={disabled || !categoryInfo}
      required={required && Boolean(categoryInfo)}
      aria-label={required ? "Issue type" : allLabel}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">
        {categoryInfo ? (required ? "Select issue" : allLabel) : "Choose a category first"}
      </option>
      {options.map((issue) => (
        <option key={issue} value={issue}>
          {issue}
        </option>
      ))}
    </select>
  );
}

/** Report-form pair: changing the category clears the previous issue. */
export default function ComplaintCategoryFields({
  category = "",
  type = "",
  onChange,
  disabled = false,
}) {
  return (
    <>
      <label>Complaint category
        <CategorySelect
          value={category}
          required
          disabled={disabled}
          onChange={(nextCategory) =>
            onChange({ complaintCategory: nextCategory, complaintType: "" })
          }
        />
      </label>

      <label>Issue type
        <IssueSelect
          category={category}
          value={type}
          required
          disabled={disabled}
          onChange={(nextType) => onChange({ complaintCategory: category, complaintType: nextType })}
        />
      </label>
    </>
  );
}
