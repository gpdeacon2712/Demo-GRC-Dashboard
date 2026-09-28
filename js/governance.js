/* governance.js  (Version 25 - Rockwell Automation demonstration)
   Shared risk-governance logic used by the Dashboard, Risk Register and
   Control Library:
     - inherent and residual risk scoring
     - organisational risk appetite and treatment recommendations
     - risk review scheduling and monitoring status
     - control design / operating effectiveness and overall control health
   All thresholds are illustrative demonstration values. */

"use strict";

/* ---------------------------------------------------------------------------
   RISK SCORING
--------------------------------------------------------------------------- */

// Converts a likelihood x impact score into the risk band used across the hub.
function riskBand(score) {
  if (score >= 15) return {label: "High", badge: "badge--risk", className: "heat--high", colour: "var(--status-red)"};
  if (score >= 8) return {label: "Medium", badge: "badge--warn", className: "heat--medium", colour: "var(--status-amber)"};
  return {label: "Low", badge: "badge--ok", className: "heat--low", colour: "var(--status-green)"};
}

// Inherent risk: exposure before controls are taken into account.
function inherentScore(risk) {
  return (Number(risk.likelihood) || 0) * (Number(risk.impact) || 0);
}

// Residual risk: exposure remaining after existing controls. Falls back to
// inherent values for records created before residual assessment.
function residualLikelihood(risk) {
  return Number.isInteger(risk.residualLikelihood) ? risk.residualLikelihood : risk.likelihood;
}

function residualImpact(risk) {
  return Number.isInteger(risk.residualImpact) ? risk.residualImpact : risk.impact;
}

function residualScore(risk) {
  return (Number(residualLikelihood(risk)) || 0) * (Number(residualImpact(risk)) || 0);
}


/* ---------------------------------------------------------------------------
   RISK APPETITE AND TREATMENT

   The appetite is the maximum residual score the organisation will accept
   without further treatment. It is set on the Risk Register page and kept
   in this browser so the demonstration can show "what if" scenarios.
--------------------------------------------------------------------------- */

const RISK_APPETITE_KEY = "grc-hub-v25.risk-appetite";

const APPETITE_LEVELS = [
  {value: 4, label: "Averse", description: "accept only residual scores of 4 or less"},
  {value: 6, label: "Minimal", description: "accept residual scores of 6 or less"},
  {value: 9, label: "Cautious", description: "accept residual scores of 9 or less"},
  {value: 12, label: "Open", description: "accept residual scores of 12 or less"}
];

const DEFAULT_APPETITE = 6;

function getRiskAppetite() {
  try {
    const stored = Number(localStorage.getItem(RISK_APPETITE_KEY));
    if (APPETITE_LEVELS.some(level => level.value === stored)) return stored;
  } catch {
    /* Storage unavailable - use the default appetite. */
  }
  return DEFAULT_APPETITE;
}

function setRiskAppetite(value) {
  try {
    localStorage.setItem(RISK_APPETITE_KEY, String(value));
    return true;
  } catch {
    return false;
  }
}

function appetiteLevel(value) {
  return APPETITE_LEVELS.find(level => level.value === value) || APPETITE_LEVELS[1];
}

// Recommends a treatment from the residual score and the organisation's appetite.
function recommendTreatment(risk, appetite) {
  const score = residualScore(risk);

  if (score <= appetite) {
    return {
      withinAppetite: true,
      recommended: "Accept and monitor",
      detail: `Residual ${score} is within appetite (≤ ${appetite}). Accept, monitor the KRI and review on schedule.`
    };
  }

  if (score >= 15) {
    return {
      withinAppetite: false,
      recommended: "Treat urgently / escalate",
      detail: `Residual ${score} is well above appetite (≤ ${appetite}). Escalate to the risk committee; mitigate, transfer or avoid.`
    };
  }

  return {
    withinAppetite: false,
    recommended: "Treat to within appetite",
    detail: `Residual ${score} exceeds appetite (≤ ${appetite}). Further mitigation or transfer is needed, or formal risk acceptance.`
  };
}

// Checks whether the recorded treatment decision is consistent with the appetite.
function treatmentCheck(risk, appetite) {
  const rec = recommendTreatment(risk, appetite);
  const option = risk.treatmentOption || "Mitigate";

  if (option === "Accept" && !rec.withinAppetite) {
    return {label: "Acceptance above appetite - sign-off required", badge: "badge--risk"};
  }
  if (option === "Accept" && rec.withinAppetite) {
    return {label: "Aligned - accepted within appetite", badge: "badge--ok"};
  }
  if (rec.withinAppetite) {
    return {label: "Aligned - residual within appetite", badge: "badge--ok"};
  }
  return {label: `${option} in progress - above appetite`, badge: "badge--warn"};
}


/* ---------------------------------------------------------------------------
   RISK REVIEW AND MONITORING
--------------------------------------------------------------------------- */

const REVIEW_MONTHS = {"Monthly": 1, "Quarterly": 3, "Semi-annual": 6, "Annual": 12};

// Review frequency is driven by the residual band when none is recorded.
function reviewFrequency(risk) {
  if (risk.reviewFrequency && REVIEW_MONTHS[risk.reviewFrequency]) return risk.reviewFrequency;
  const band = riskBand(residualScore(risk)).label;
  return band === "High" ? "Monthly" : band === "Medium" ? "Quarterly" : "Semi-annual";
}

function parseISODate(value) {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Date(`${value}T00:00:00`);
}

function todayMidnight() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function formatUKDate(date) {
  return date
    ? new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", year: "numeric"}).format(date)
    : "Not recorded";
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Returns the next review date and a status of Overdue / Due soon / On track.
function reviewStatus(risk) {
  const last = parseISODate(risk.lastReviewed);
  const frequency = reviewFrequency(risk);

  if (!last) {
    return {frequency, next: null, days: null, label: "Not reviewed", badge: "badge--risk", state: "overdue"};
  }

  const next = addMonths(last, REVIEW_MONTHS[frequency]);
  const days = Math.ceil((next - todayMidnight()) / 86400000);

  if (days < 0) {
    return {frequency, next, days, label: `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`, badge: "badge--risk", state: "overdue"};
  }
  if (days <= 30) {
    return {frequency, next, days, label: days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`, badge: "badge--warn", state: "soon"};
  }
  return {frequency, next, days, label: "On track", badge: "badge--ok", state: "ok"};
}


/* ---------------------------------------------------------------------------
   CONTROL EFFECTIVENESS AND HEALTH

   Design effectiveness: is the control designed to address the risk?
   Operating effectiveness: has it operated as designed over the test period?
   Overall health takes the weaker of the two results.
--------------------------------------------------------------------------- */

const EFFECTIVENESS_BADGE = {
  "Effective": "badge--ok",
  "Partially effective": "badge--warn",
  "Ineffective": "badge--risk",
  "Not assessed": ""
};

function controlHealth(control) {
  const results = [control.designEffectiveness, control.operatingEffectiveness];

  if (results.includes("Ineffective")) {
    return {label: "Ineffective", badge: "badge--risk", rank: 3};
  }
  if (results.includes("Partially effective")) {
    return {label: "Needs improvement", badge: "badge--warn", rank: 2};
  }
  if (results.every(value => value === "Effective")) {
    return {label: "Effective", badge: "badge--ok", rank: 0};
  }
  return {label: "Not fully assessed", badge: "", rank: 1};
}

// Identifies controls whose next scheduled test date has passed.
function controlTestStatus(control) {
  const next = parseISODate(control.nextTest);
  if (!next) return {next: null, overdue: false, label: "No test scheduled"};

  const days = Math.ceil((next - todayMidnight()) / 86400000);
  if (days < 0) return {next, overdue: true, label: `Test overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`};
  if (days <= 30) return {next, overdue: false, label: `Test due in ${days} day${days === 1 ? "" : "s"}`};
  return {next, overdue: false, label: `Next test ${formatUKDate(next)}`};
}

// Creates a badge element with accessible text (colour is supplementary only).
function makeBadge(text, badgeClass) {
  const badge = document.createElement("span");
  badge.className = `badge ${badgeClass || ""}`.trim();
  badge.textContent = text;
  return badge;
}
