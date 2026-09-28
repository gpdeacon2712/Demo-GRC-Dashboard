
/* support.js
   Implements the Governance Support demonstration workflow.
   Requests are stored locally in the browser and are not transmitted
   to external services.
*/

"use strict";

const SUPPORT_STORAGE_KEY = "grcHubV25SupportRequests";

const supportForm = document.getElementById("support-form");
const supportFeedback = document.getElementById("support-feedback");
const supportList = document.getElementById("support-request-list");
const clearSupportButton = document.getElementById("clear-support");
const downloadSupportButton = document.getElementById("download-support");
const messageInput = document.getElementById("request-message");
const messageCount = document.getElementById("message-count");

let supportRequests = loadStoredList(SUPPORT_STORAGE_KEY);


// Generates the next sequential support-request identifier.
function nextRequestId() {
  const numbers = supportRequests
    .map(item =>
      Number.parseInt(
        String(item.id || "").replace(/\D/g, ""),
        10
      )
    )
    .filter(Number.isFinite);

  return `SUP-${String(
    (numbers.length ? Math.max(...numbers) : 0) + 1
  ).padStart(3, "0")}`;
}


// Converts the stored timestamp into a readable local date and time.
function formatDateTime(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Unknown"
    : date.toLocaleString();
}


// Renders saved requests newest first and provides an empty state when required.
function renderSupportRequests() {
  supportList.replaceChildren();

  clearSupportButton.hidden =
    supportRequests.length === 0;

  if (!supportRequests.length) {
    const empty =
      document.createElement("p");

    empty.textContent =
      "No browser-local support requests have been saved.";

    supportList.append(empty);
    return;
  }

  supportRequests
    .slice()
    .reverse()
    .forEach(request => {
      const article =
        document.createElement("article");

      article.className =
        "result-card support-request-card";

      const heading =
        document.createElement("h3");

      heading.textContent =
        `${request.id}: ${request.subject}`;

      const metadata =
        document.createElement("p");

      metadata.className =
        "support-metadata";

      metadata.textContent =
        `${request.typeLabel} · ${request.priority} priority · ${formatDateTime(request.createdAt)}`;

      const related =
        document.createElement("p");

      const relatedLabel =
        document.createElement("strong");

      relatedLabel.textContent =
        "Related record: ";

      related.append(
        relatedLabel,
        request.relatedRecord || "None specified"
      );

      const requester =
        document.createElement("p");

      const requesterLabel =
        document.createElement("strong");

      requesterLabel.textContent =
        "Requester: ";

      requester.append(
        requesterLabel,
        `${request.name} (${request.department || "Department not specified"})`
      );

      const message =
        document.createElement("p");

      message.textContent =
        request.message;

      article.append(
        heading,
        metadata,
        related,
        requester,
        message
      );

      supportList.append(article);
    });
}


// Pre-populates request fields when another module links into the support page.
function applyQueryContext() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  const type =
    params.get("type");

  const record =
    params.get("record");

  const subject =
    params.get("subject");

  const typeField =
    document.getElementById(
      "request-type"
    );

  const recordField =
    document.getElementById(
      "related-record"
    );

  const subjectField =
    document.getElementById(
      "request-subject"
    );

  // Only applies a request type that exists in the current select options.
  if (
    type &&
    [...typeField.options]
      .some(
        option =>
          option.value === type
      )
  ) {
    typeField.value = type;
  }

  // Respect the receiving fields' maximum lengths.
  if (record) {
    recordField.value =
      record.slice(0, 40);
  }

  if (subject) {
    subjectField.value =
      subject.slice(0, 120);
  }
}


// Updates the live character count as the message is entered.
messageInput.addEventListener(
  "input",
  () => {
    messageCount.value =
      String(
        messageInput.value.length
      );
  }
);


// Validates, creates and stores a fictional support request in the browser.
supportForm.addEventListener(
  "submit",
  event => {
    event.preventDefault();

    if (
      !supportForm.reportValidity()
    ) {
      return;
    }

    const data =
      new FormData(
        supportForm
      );

    const typeField =
      document.getElementById(
        "request-type"
      );

    const request = {
      id: nextRequestId(),

      name: String(
        data.get(
          "requester-name"
        ) || ""
      ).trim(),

      email: String(
        data.get(
          "requester-email"
        ) || ""
      ).trim(),

      department: String(
        data.get(
          "requester-department"
        ) || ""
      ),

      type: String(
        data.get(
          "request-type"
        ) || ""
      ),

      typeLabel:
        typeField.options[
          typeField.selectedIndex
        ].text,

      priority: String(
        data.get(
          "request-priority"
        ) || ""
      ),

      relatedRecord: String(
        data.get(
          "related-record"
        ) || ""
      )
        .trim()
        .toUpperCase(),

      subject: String(
        data.get(
          "request-subject"
        ) || ""
      ).trim(),

      message: String(
        data.get(
          "request-message"
        ) || ""
      ).trim(),

      createdAt:
        new Date().toISOString()
    };

    supportRequests.push(
      request
    );

    const persisted =
      saveStoredList(
        SUPPORT_STORAGE_KEY,
        supportRequests
      );

    // Makes clear whether the request was persisted or is session-only.
    supportFeedback.textContent =
      persisted
        ? `${request.id} was saved in this browser. It was not sent to a governance team.`
        : `${request.id} was added temporarily, but browser storage was unavailable.`;

    supportForm.reset();

    messageCount.value = "0";

    renderSupportRequests();

    supportFeedback.focus?.();
  }
);


// Clears all browser-local requests after user confirmation.
clearSupportButton.addEventListener(
  "click",
  () => {
    if (
      !window.confirm(
        "Remove all support requests saved in this browser?"
      )
    ) {
      return;
    }

    supportRequests = [];

    clearStoredList(
      SUPPORT_STORAGE_KEY
    );

    supportFeedback.textContent =
      "All browser-local support requests were removed.";

    renderSupportRequests();
  }
);


// Exports the browser-local request history as CSV.
downloadSupportButton.addEventListener(
  "click",
  () => {
    if (!supportRequests.length) {
      supportFeedback.textContent =
        "There are no saved support requests to download.";

      return;
    }

    const rows = [
      [
        "Request ID",
        "Created",
        "Type",
        "Priority",
        "Related record",
        "Subject",
        "Requester",
        "Email",
        "Department",
        "Message"
      ]
    ];

    supportRequests.forEach(
      request =>
        rows.push([
          request.id,
          request.createdAt,
          request.typeLabel,
          request.priority,
          request.relatedRecord,
          request.subject,
          request.name,
          request.email,
          request.department,
          request.message
        ])
    );

    downloadCSV(
      "grc-support-requests.csv",
      rows
    );
  }
);


// Applies any incoming context, then renders locally saved requests.
applyQueryContext();
renderSupportRequests();

