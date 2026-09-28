
/* profile.js
   Implements session-only profile functionality.
   Profile data is deliberately transient to demonstrate a different
   retention approach from the persisted governance registers.
*/

"use strict";

const profileForm = document.getElementById("profile-form");
const profileFeedback = document.getElementById("profile-feedback");


// Handles profile submission without persisting the data to localStorage.
profileForm.addEventListener("submit", event => {
  event.preventDefault();

  const data = new FormData(profileForm);
  const name = String(data.get("display-name") || "").trim();

  // Converts stored option values into their visible labels.
  const role = document.querySelector(
    `#role-type option[value="${CSS.escape(String(data.get("role-type")))}"]`
  )?.textContent;

  const department = document.querySelector(
    `#department option[value="${CSS.escape(String(data.get("department")))}"]`
  )?.textContent;

  // Confirms the session-only profile details to the user.
  profileFeedback.className = "results-region success-message";
  profileFeedback.textContent =
    `Profile saved for this session. Welcome, ${name}. Role: ${role}; department: ${department}.`;

  // Displays the active profile as visible page content rather than a tooltip.
  let indicator = document.getElementById("session-indicator");

  // Creates the indicator only on the first successful submission.
  if (!indicator) {
    indicator = document.createElement("p");
    indicator.id = "session-indicator";
    indicator.className = "session-indicator";
    document.querySelector(".page-header").append(indicator);
  }

  // Updates the existing indicator when the profile is changed.
  indicator.textContent = `Session profile: ${name} - ${role}`;
});


