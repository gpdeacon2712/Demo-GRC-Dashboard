/* ai-register.js
   Provides AI use-case registration, recommendation and export features.
   The module maintains a clear separation between supplied synthetic
   records and user-generated entries, supporting repeatable testing,
   demonstrations and dataset integrity. */

"use strict";

const form = document.getElementById("ai-usecase-form");
const slider = document.getElementById("risk-rating");
const output = document.getElementById("risk-output");
const riskDecrease = document.getElementById("risk-decrease");
const riskIncrease = document.getElementById("risk-increase");
const feedback = document.getElementById("register-feedback");

// Business purpose field and character counter
const purposeInput = document.getElementById("purpose");
const purposeCount = document.getElementById("purpose-count");

// Synthetic baseline records and user-generated records are managed
// independently. User additions are persisted in localStorage and
// merged at runtime, preserving dataset integrity during resets.
const USECASE_STORAGE_KEY = "grc-hub-v25.user-usecases";
let baselineUseCases = [];
let userUseCases = [];
let useCases = [];
let allControls = [];
let allRisks = [];

function refreshUseCases() {
  useCases = [...baselineUseCases, ...userUseCases];
  renderUseCases();

  const clearButton = document.getElementById("clear-saved-usecases");

  if (clearButton) {
    clearButton.hidden = userUseCases.length === 0;
  }
}

// Generates representative AI-governance risk recommendations based on
// selected data categories, risk ratings and oversight requirements.
// The mappings are illustrative demonstration rules and should not be
// considered a substitute for a formal risk assessment.
function recommendRisks(dataCategory, riskRating, oversight) {
  const ids = new Set(["RSK-014"]);

  if (["internal", "personal", "special"].includes(dataCategory)) {
    ids.add("RSK-012");
  }

  if (["personal", "special"].includes(dataCategory)) {
    ids.add("RSK-013");
  }

  if (riskRating >= 4) {
    ids.add("RSK-015");
  }

  if (
    !oversight.includes("human-review") &&
    !oversight.includes("approval-gate")
  ) {
    ids.add("RSK-016");
  }

  return [...ids];
}

function makeRecordLink(href, text) {
  const link = document.createElement("a");
  link.className = "record-link";
  link.href = href;
  link.textContent = text;

  return link;
}

// Demonstrates control traceability by linking governance selections
// to representative controls within the Control Library. These mappings
// are intended to support understanding rather than provide definitive
// control assessments.
function recommendControls(dataCategory, riskRating, oversight, frameworks) {
  const ids = new Set(["CTL-010", "CTL-011"]);

  if (
    oversight.includes("human-review") ||
    oversight.includes("approval-gate")
  ) {
    ids.add("CTL-012");
  }

  if (["internal", "personal", "special"].includes(dataCategory)) {
    ids.add("CTL-017");
  }

  if (["personal", "special"].includes(dataCategory)) {
    ids.add("CTL-018");
  }

  if (riskRating >= 4) {
    ids.add("CTL-019");
  }

  if (oversight.includes("audit-logging")) {
    ids.add("CTL-013");
  }

  if (frameworks.includes("IEC 62443")) {
    ids.add("CTL-004");
  }

  return [...ids];
}

const APPROVAL_BADGE = {
  Approved: "badge--ok",
  "Pending review": "badge--warn",
  Rejected: "badge--risk",
};

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

// Updates the displayed AI register by combining baseline and user-created records.
function renderUseCases() {
  const list = document.getElementById("usecase-list");
  list.replaceChildren();

  for (const useCase of useCases) {
    const item = document.createElement("li");
    item.className = "usecase-card";

    const heading = document.createElement("h3");

    const ref = document.createElement("span");
    ref.className = "ref-id";
    ref.textContent = useCase.id;

    item.id = useCase.id;

    heading.append(ref, ` ${useCase.toolName}`);

    const status = document.createElement("span");
    status.className =
      `badge ${APPROVAL_BADGE[useCase.approvalStatus] || ""}`;
    status.textContent = useCase.approvalStatus;

    const details = document.createElement("p");

    const frameworks = useCase.frameworkAlignment.length
      ? useCase.frameworkAlignment.join(", ")
      : "No framework selected";

    details.textContent =
      `${useCase.ownerRole} · Risk ${useCase.riskRating}/5 · ` +
      `Review ${formatDate(useCase.reviewDate)} · ${frameworks}`;

    const controls = document.createElement("p");
    controls.className = "mapped-controls";

    const controlLookup = new Map(
      allControls.map(control => [control.id, control])
    );

    const mapped = (useCase.controlIds || []).map(id => {
      const control = controlLookup.get(id);

      return `${id} ${control?.name || "Unknown control"} ` +
        `(${control?.status || "status unavailable"})`;
    });

    controls.append("Applicable controls: ");

    if (mapped.length) {
      (useCase.controlIds || []).forEach((id, index) => {
        const control = controlLookup.get(id);

        if (index) {
          controls.append("; ");
        }

        controls.append(
          makeRecordLink(
            `controls.html#${id}`,
            `${id} ${control?.name || "Unknown control"} ` +
              `(${control?.status || "status unavailable"})`
          )
        );
      });
    } else {
      controls.append("None mapped");
    }

    const riskLookup = new Map(
      allRisks.map(risk => [risk.id, risk])
    );

    const risks = document.createElement("p");
    risks.className = "mapped-risks";
    risks.append("AI-specific risks: ");

    if ((useCase.riskIds || []).length) {
      useCase.riskIds.forEach((id, index) => {
        if (index) {
          risks.append("; ");
        }

        risks.append(
          makeRecordLink(
            `risks.html#${id}`,
            `${id} ${riskLookup.get(id)?.title || "Unknown risk"}`
          )
        );
      });
    } else {
      risks.append("None identified");
    }

    item.append(heading, status, details, controls, risks);
    list.append(item);
  }
}

function roleLabel(value) {
  return (
    document.querySelector(
      `#owner-role option[value="${CSS.escape(value)}"]`
    )?.textContent || value
  );
}

// Prevent a newly registered use case from being assigned a review date in the past.
function setMinimumReviewDate() {
  const dateInput = document.getElementById("review-date");
  const today = new Date();

  const localToday = new Date(
    today.getTime() - today.getTimezoneOffset() * 60000
  )
    .toISOString()
    .slice(0, 10);

  dateInput.min = localToday;
}

// Updates the number shown beside the risk slider.
function updateRiskOutput() {
  output.value = slider.value;
  output.textContent = slider.value;
}

// Updates the character count for the intended business purpose field.
function updatePurposeCount() {
  if (purposeInput && purposeCount) {
    purposeCount.textContent = purposeInput.value.length;
  }
}

// Update the risk value when the slider is moved.
slider.addEventListener("input", updateRiskOutput);

// Update the business purpose character count as the user types.
purposeInput?.addEventListener("input", updatePurposeCount);

riskDecrease?.addEventListener("click", () => {
  slider.value = String(
    Math.max(
      Number(slider.min),
      Number(slider.value) - Number(slider.step || 1)
    )
  );

  updateRiskOutput();
  slider.focus();
});

riskIncrease?.addEventListener("click", () => {
  slider.value = String(
    Math.min(
      Number(slider.max),
      Number(slider.value) + Number(slider.step || 1)
    )
  );

  updateRiskOutput();
  slider.focus();
});

// Validates governance requirements, stores the new AI use case locally
// and updates the register without affecting the baseline records.
form.addEventListener("submit", event => {
  event.preventDefault();
  feedback.replaceChildren();

  const data = new FormData(form);
  const category = data.get("data-category");
  const oversight = data.getAll("oversight");
  const toolName = String(data.get("tool-name") || "").trim();

  if (
    ["personal", "special"].includes(category) &&
    oversight.length === 0
  ) {
    feedback.textContent =
      "Select at least one human oversight arrangement when personal " +
      "or special-category data is used.";

    feedback.className = "results-region error-message";

    document.getElementById("oversight-review").focus();

    return;
  }

  if (
    useCases.some(
      item => item.toolName.toLowerCase() === toolName.toLowerCase()
    )
  ) {
    feedback.textContent =
      "That AI tool name is already registered. Use a distinct name " +
      "or update the existing record.";

    feedback.className = "results-region error-message";

    document.getElementById("tool-name").focus();

    return;
  }

  const nextNumber =
    Math.max(
      0,
      ...useCases.map(
        item => Number(item.id.replace(/\D/g, "")) || 0
      )
    ) + 1;

  const frameworks = data.getAll("framework-alignment");
  const riskRating = Number(data.get("risk-rating"));

  userUseCases.push({
    id: `AI-${String(nextNumber).padStart(3, "0")}`,
    toolName,
    purpose: String(data.get("purpose") || "").trim(),
    supplier: String(data.get("supplier") || "").trim(),
    ownerRole: roleLabel(String(data.get("owner-role"))),
    ownerEmail: String(data.get("owner-email") || "").trim(),
    dataCategory: category,
    riskRating,
    approvalStatus: "Pending review",
    oversight,
    reviewDate: String(data.get("review-date")),
    frameworkAlignment: frameworks,
    controlIds: recommendControls(
      category,
      riskRating,
      oversight,
      frameworks
    ),
    riskIds: recommendRisks(
      category,
      riskRating,
      oversight
    ),
  });

  const saved = saveStoredList(
    USECASE_STORAGE_KEY,
    userUseCases
  );

  refreshUseCases();

  // Clear the completed form after the use case has been registered.
  form.reset();

  // Restore dynamic form displays after the form has been reset.
  updateRiskOutput();
  updatePurposeCount();

  feedback.className = "results-region success-message";

  // localStorage may be unavailable in some browser modes. In that case,
  // the record remains available only for the current page session.
  feedback.textContent = saved
    ? `${toolName} was added and saved in this browser ` +
      `(localStorage - not sent to any server).`
    : `${toolName} was added for this browser session only ` +
      `(localStorage unavailable).`;

  document.getElementById("tool-name").focus();
});

// Load baseline use cases, controls and risks in parallel, then merge local additions.
async function initUseCases() {
  setMinimumReviewDate();
  updateRiskOutput();
  updatePurposeCount();

  try {
    [baselineUseCases, allControls, allRisks] = await Promise.all([
      loadJSON("data/ai-usecases.json"),
      loadJSON("data/controls.json"),
      loadJSON("data/risks.json"),
    ]);

    userUseCases = loadStoredList(USECASE_STORAGE_KEY);

    refreshUseCases();
  } catch (error) {
    feedback.className = "results-region error-message";

    feedback.textContent =
      `Existing use cases could not be loaded. ` +
      `Serve the site over http. (${error.message})`;
  }
}

// Clears user-created records while preserving the baseline demonstration data.
document
  .getElementById("clear-saved-usecases")
  ?.addEventListener("click", () => {
    userUseCases = [];

    clearStoredList(USECASE_STORAGE_KEY);

    refreshUseCases();

    feedback.className = "results-region success-message";

    feedback.textContent =
      "Saved use cases were removed from this browser's localStorage.";
  });

document
  .getElementById("download-usecases")
  ?.addEventListener("click", () => {
    const rows = [
      [
        "ID",
        "Tool name",
        "Purpose",
        "Supplier",
        "Owner role",
        "Owner email",
        "Data category",
        "Risk rating",
        "Approval status",
        "Oversight",
        "Review date",
        "Framework alignment",
        "Applicable controls",
        "AI-specific risks",
      ],

      ...useCases.map(item => [
        item.id,
        item.toolName,
        item.purpose,
        item.supplier || "",
        item.ownerRole,
        item.ownerEmail || "",
        item.dataCategory,
        item.riskRating,
        item.approvalStatus,
        (item.oversight || []).join("; "),
        item.reviewDate,
        (item.frameworkAlignment || []).join("; "),
        (item.controlIds || []).join("; "),
        (item.riskIds || []).join("; "),
      ]),
    ];

    downloadCSV(
      "ai-use-case-register.csv",
      rows
    );
  });

initUseCases();

