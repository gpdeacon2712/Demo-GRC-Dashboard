/* main.js
   Shared functions used across the website.

   GRC & AI Governance Hub - Version 25 (Rockwell Automation demonstration)

   Demonstration build derived from the Version 23.4 academic prototype.
   Version 25 extensions were developed with AI assistance (Claude).
   All data is fictional / synthetic. Not an official Rockwell Automation system.
*/

"use strict";


/* ---------------------------------------------------------------------------
   OLD MOBILE NAVIGATION

   Legacy navigation retained for reference after migration to Bootstrap 5.
---------------------------------------------------------------------------

const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.getElementById("site-nav");

if (navToggle && siteNav) {
  // Show the navigation and add the enhanced styling.
  siteNav.hidden = false;
  siteNav.classList.add("site-nav--enhanced");

  navToggle.addEventListener("click", () => {
    const isOpen = navToggle.getAttribute("aria-expanded") === "true";
    navToggle.setAttribute("aria-expanded", String(!isOpen));
    siteNav.classList.toggle("site-nav--open", !isOpen);
  });

  siteNav.addEventListener("click", event => {
    if (
      event.target.closest("a") &&
      window.matchMedia("(max-width: 47.99rem)").matches
    ) {
      navToggle.setAttribute("aria-expanded", "false");
      siteNav.classList.remove("site-nav--open");
    }
  });
}
--------------------------------------------------------------------------- */


/* ---------------------------------------------------------------------------
   LOAD JSON DATA

   Loads local prototype data using fetch().
   The site should be served over HTTP rather than opened with file://.
--------------------------------------------------------------------------- */

async function loadJSON(path) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Could not load ${path} (HTTP ${response.status})`);
  }

  return response.json();
}


/* ---------------------------------------------------------------------------
   LOCAL STORAGE

   Shared helpers for loading, saving and clearing browser-stored records.
   try/catch allows the application to degrade safely if storage is unavailable.
--------------------------------------------------------------------------- */

// Returns a stored array, or an empty array if storage is unavailable or invalid.
function loadStoredList(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}


// Saves a list to localStorage and reports whether the operation succeeded.
function saveStoredList(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}


// Removes a stored list without interrupting the application if storage fails.
function clearStoredList(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Storage is unavailable or there is nothing to clear. */
  }
}


/* ---------------------------------------------------------------------------
   CSV EXPORT

   Converts row data to CSV and downloads it as a UTF-8 file.
--------------------------------------------------------------------------- */

function downloadCSV(filename, rows) {

  // Escapes values containing commas, quotes or line breaks.
  const escapeCell = value => {
    const text = String(value ?? "");

    return /[",\n]/.test(text)
      ? `"${text.replace(/"/g, '""')}"`
      : text;
  };

  const csv = rows
    .map(row => row.map(escapeCell).join(","))
    .join("\r\n");

  // Adds a UTF-8 BOM to improve spreadsheet compatibility.
  const blob = new Blob(
    ["\uFEFF" + csv],
    {type: "text/csv;charset=utf-8;"}
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.append(link);
  link.click();
  link.remove();

  // Releases the temporary browser URL after the download starts.
  URL.revokeObjectURL(url);
}


/* ---------------------------------------------------------------------------
   LINKED RECORD HIGHLIGHTING

   Highlights and scrolls to a record opened through a URL fragment.
--------------------------------------------------------------------------- */

function highlightLinkedRecord() {
  const id = decodeURIComponent(window.location.hash.slice(1));

  if (!id) return;

  window.setTimeout(() => {
    const target = document.getElementById(id);

    if (!target) return;

    target.classList.add("linked-target");

    // Respects reduced-motion preferences when scrolling to the target.
    target.scrollIntoView({
      behavior: window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches
        ? "auto"
        : "smooth",
      block: "center"
    });

    // Moves focus to an interactive element when the target is a table row.
    if (target.matches("tr")) {
      target
        .querySelector("a, button")
        ?.focus({preventScroll: true});
    }
  }, 250);
}


// Re-run highlighting when the fragment changes or the page first loads.
window.addEventListener(
  "hashchange",
  highlightLinkedRecord
);

window.addEventListener(
  "DOMContentLoaded",
  highlightLinkedRecord
);


/* Bootstrap provides the shared layout and navigation.
   Application-specific functions remain separate for maintainability. */

document.documentElement.dataset.appVersion = "25";


/* ---------------------------------------------------------------------------
   FORM VALIDATION

   Uses native browser validation with clearer inline error messages.
   Errors are linked to their fields for accessibility.
--------------------------------------------------------------------------- */

// Returns a user-friendly validation message for the failed constraint.
function validationMessageFor(control) {
  if (control.validity.valueMissing) {
    return "This field is required.";
  }

  if (
    control.validity.typeMismatch &&
    control.type === "email"
  ) {
    return "Enter a valid email address.";
  }

  if (control.validity.patternMismatch) {
    return control.title ||
      "Enter a value in the requested format.";
  }

  if (control.validity.tooShort) {
    return `Enter at least ${control.minLength} characters.`;
  }

  if (control.validity.tooLong) {
    return `Enter no more than ${control.maxLength} characters.`;
  }

  if (control.validity.rangeUnderflow) {
    return `Enter a value of at least ${control.min}.`;
  }

  if (control.validity.rangeOverflow) {
    return `Enter a value no greater than ${control.max}.`;
  }

  return control.validationMessage ||
    "Check this field and try again.";
}


// Creates an inline error element and associates it with the form control.
function ensureInlineError(control) {
  if (!control.id) return null;

  const errorId = `${control.id}-error`;
  let error = document.getElementById(errorId);

  if (!error) {
    error = document.createElement("p");
    error.id = errorId;
    error.className =
      "form-hint error-message validation-error";
    error.hidden = true;

    control.insertAdjacentElement(
      "afterend",
      error
    );
  }

  // Preserve existing descriptions while adding the validation message.
  const describedBy = new Set(
    (control.getAttribute("aria-describedby") || "")
      .split(/\s+/)
      .filter(Boolean)
  );

  describedBy.add(errorId);

  control.setAttribute(
    "aria-describedby",
    [...describedBy].join(" ")
  );

  return error;
}


// Displays the appropriate inline message and marks the field invalid.
function showInlineError(control) {
  const error = ensureInlineError(control);

  if (!error) return;

  error.textContent =
    validationMessageFor(control);

  error.hidden = false;

  control.setAttribute(
    "aria-invalid",
    "true"
  );
}


// Hides the inline message when the control becomes valid.
function clearInlineError(control) {
  if (!control.id) return;

  const error = document.getElementById(
    `${control.id}-error`
  );

  if (error) {
    error.hidden = true;
  }

  control.removeAttribute("aria-invalid");
}


/* Capture invalid events so browser validation can be enhanced consistently. */

document.addEventListener(
  "invalid",
  event => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      showInlineError(event.target);
    }
  },
  true
);


/* Remove errors as soon as a field becomes valid while typing. */

document.addEventListener(
  "input",
  event => {
    const control = event.target;

    if (
      (
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      ) &&
      control.validity.valid
    ) {
      clearInlineError(control);
    }
  }
);


/* Also clear errors when select, radio or checkbox values change. */

document.addEventListener(
  "change",
  event => {
    const control = event.target;

    if (
      (
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      ) &&
      control.validity.valid
    ) {
      clearInlineError(control);
    }
  }
);



