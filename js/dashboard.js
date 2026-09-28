/* dashboard.js
   Builds data-driven dashboard metrics, relationship views and insights.
   Values are calculated from current Risk, Control and AI datasets rather
   than being hard-coded. */

"use strict";

// Stores dashboard metrics and rotating-message state.
const dashboardState = { metrics: null, messageIndex: 0, timer: null, paused: false, handlersAttached: false };


// Loads governance datasets, merges local records and renders dashboard metrics.
async function renderDashboard() {
  const section = document.getElementById("metric-cards");

  try {
    const [controls, baselineRisks, baselineUseCases] = await Promise.all([
      loadJSON("data/controls.json"), loadJSON("data/risks.json"), loadJSON("data/ai-usecases.json")
    ]);

    // Merge baseline records with browser-added risks and AI use cases.
    const risks = [...baselineRisks, ...loadStoredList("grc-hub-v25.user-risks")];
    const useCases = [...baselineUseCases, ...loadStoredList("grc-hub-v25.user-usecases")];

    const controlMap = new Map(controls.map(control => [control.id, control]));
    const implemented = controls.filter(control => control.status === "Implemented").length;
    // Version 25: headline risk metrics use residual ratings and the risk appetite.
    const appetite = getRiskAppetite();
    const inherentHigh = risks.filter(risk => riskBand(inherentScore(risk)).label === "High").length;
    const high = risks.filter(risk => riskBand(residualScore(risk)).label === "High").length;
    const aboveAppetite = risks.filter(risk => !recommendTreatment(risk, appetite).withinAppetite).length;
    const reviewsOverdue = risks.filter(risk => reviewStatus(risk).state === "overdue").length;
    const effectiveControls = controls.filter(control => controlHealth(control).label === "Effective").length;
    const pending = useCases.filter(useCase => useCase.approvalStatus === "Pending review").length;
    const mapped = risks.filter(risk => (risk.controlIds || []).length > 0);
    const without = risks.length - mapped.length;

    const withImplemented = risks.filter(risk =>
      (risk.controlIds || []).some(id => controlMap.get(id)?.status === "Implemented")
    ).length;

    const highWithoutImplemented = risks.filter(risk =>
      riskBand(residualScore(risk)).label === "High" && !(risk.controlIds || []).some(id => controlMap.get(id)?.status === "Implemented")
    ).length;

    const coverage = risks.length ? Math.round((mapped.length / risks.length) * 100) : 0;

    dashboardState.metrics = {implemented, controls: controls.length, risks: risks.length, high, inherentHigh, aboveAppetite, appetite, reviewsOverdue, effectiveControls, useCases: useCases.length, pending, coverage};

    renderRelationshipHealth({risks, controls, useCases, coverage});
    renderUpcomingReviews(useCases, risks);
    renderFrameworkCoverage(controls);

    // Defines the headline metric cards shown on the dashboard.
    const metrics = [
      {value: String(risks.length), label: "Risks on register", icon: "📋"},
      {value: `${inherentHigh} → ${high}`, label: "High risks: inherent → residual", icon: "⚠️"},
      {value: String(aboveAppetite), label: `Residual risks above appetite (≤ ${appetite})`, icon: "🎯"},
      {value: String(reviewsOverdue), label: "Risk reviews overdue", icon: "📅"},
      {value: `${implemented}/${controls.length}`, label: "Controls implemented", icon: "🛡️"},
      {value: `${effectiveControls}/${controls.length}`, label: "Controls rated effective (design and operating)", icon: "✅"},
      {value: `${coverage}%`, label: "Risks with mapped controls", icon: "🔗"},
      {value: String(pending), label: "AI use cases pending review", icon: "🤖"}
    ];

    // Builds the metric cards from the calculated values.
    section.replaceChildren();

    metrics.forEach(metric => {
      const card = document.createElement("article");
      card.className = "card";

      const icon = document.createElement("span");
      icon.className = "metric-card-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = metric.icon;

      const value = document.createElement("span");
      value.className = "metric";
      value.textContent = metric.value;

      const label = document.createElement("span");
      label.className = "metric-label";
      label.textContent = metric.label;

      card.append(icon, value, label);
      section.append(card);
    });

    initialiseRotatingMessages();

  } catch (error) {
    section.replaceChildren();

    const paragraph = document.createElement("p");
    paragraph.textContent = `Metrics could not be loaded. Serve the site over http — see README. (${error.message})`;

    section.append(paragraph);
  }
}


// Builds linked summary nodes showing relationships across governance records.
function renderRelationshipHealth({risks, controls, useCases, coverage}) {
  const container = document.getElementById("relationship-health");
  if (!container) return;

  const values = [
    {value: useCases.length, label: "AI use cases", href: "ai-register.html"},
    {value: risks.length, label: "identified risks", href: "risks.html"},
    {value: controls.length, label: "governance controls", href: "controls.html"},
    {value: `${coverage}%`, label: "risk-control coverage", href: "risks.html"}
  ];

  container.replaceChildren();

  values.forEach((item, index) => {
    const article = document.createElement("article");
    article.className = "relationship-node";

    const link = document.createElement("a");
    link.href = item.href;
    link.setAttribute("aria-label", `${item.value} ${item.label}; open related register`);

    const value = document.createElement("span");
    value.className = "relationship-value";
    value.textContent = item.value;

    const label = document.createElement("span");
    label.className = "relationship-label";
    label.textContent = item.label;

    link.append(value, label);
    article.append(link);
    container.append(article);

    // Decorative arrows show the visual relationship between nodes.
    if (index < values.length - 1) {
      const arrow = document.createElement("span");
      arrow.className = "relationship-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "→";
      container.append(arrow);
    }
  });
}


// Selects the four nearest review dates and identifies overdue or imminent items.
function renderUpcomingReviews(useCases, risks = []) {
  const container = document.getElementById("upcoming-reviews");
  if (!container) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const aiReviews = useCases
    .filter(useCase => useCase.reviewDate && !Number.isNaN(Date.parse(useCase.reviewDate)))
    .map(useCase => {
      const date = new Date(`${useCase.reviewDate}T00:00:00`);
      const days = Math.ceil((date - today) / 86400000);
      return {
        id: useCase.id, name: useCase.toolName, date, days,
        href: `ai-register.html#${encodeURIComponent(useCase.id)}`,
        detail: useCase.approvalStatus || "Status not recorded"
      };
    });

  // Version 25: risk reviews scheduled from the last review date and frequency.
  const riskReviews = risks
    .map(risk => ({risk, review: reviewStatus(risk)}))
    .filter(item => item.review.next)
    .map(({risk, review}) => ({
      id: risk.id, name: risk.title, date: review.next, days: review.days,
      href: `risks.html#${encodeURIComponent(risk.id)}`,
      detail: `${review.frequency} risk review · residual ${residualScore(risk)}`
    }));

  const reviews = [...riskReviews, ...aiReviews]
    .sort((a, b) => a.date - b.date)
    .slice(0, 6);

  container.replaceChildren();

  if (!reviews.length) {
    const paragraph = document.createElement("p");
    paragraph.textContent = "No review dates are currently recorded.";
    container.append(paragraph);
    return;
  }

  // Formats review dates using UK date conventions.
  const dateFormatter = new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", year: "numeric"});

  reviews.forEach(review => {
    const article = document.createElement("article");
    article.className = "review-item";

    if (review.days < 0) article.classList.add("review-item--overdue");
    else if (review.days <= 30) article.classList.add("review-item--soon");

    const heading = document.createElement("h3");
    const link = document.createElement("a");
    link.href = review.href;
    link.textContent = `${review.id}: ${review.name}`;
    heading.append(link);

    const date = document.createElement("p");
    date.className = "review-date";
    date.textContent = dateFormatter.format(review.date);

    const status = document.createElement("p");
    status.className = "review-status";
    status.textContent = review.days < 0
      ? `${Math.abs(review.days)} day${Math.abs(review.days) === 1 ? "" : "s"} overdue`
      : review.days === 0
        ? "Due today"
        : `Due in ${review.days} day${review.days === 1 ? "" : "s"} · ${review.detail}`;

    article.append(heading, date, status);
    container.append(article);
  });
}


// Calculates framework coverage directly from the Control Library dataset.
function renderFrameworkCoverage(controls) {
  const container = document.getElementById("framework-coverage");
  if (!container) return;

  const frameworkMap = new Map();

  controls.forEach(control => {
    (control.frameworks || []).forEach(framework => {
      const entry = frameworkMap.get(framework) || {total: 0, implemented: 0};

      entry.total += 1;
      if (control.status === "Implemented") entry.implemented += 1;

      frameworkMap.set(framework, entry);
    });
  });

  container.replaceChildren();

  // Sorts frameworks by mapped-control count, then alphabetically.
  [...frameworkMap.entries()]
    .sort((a,b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
    .forEach(([framework, values]) => {
      const article = document.createElement("article");
      article.className = "framework-row";

      const heading = document.createElement("h3");
      heading.textContent = framework;

      const summary = document.createElement("p");
      summary.textContent = `${values.implemented} implemented of ${values.total} mapped controls`;

      const progress = document.createElement("progress");
      progress.max = values.total;
      progress.value = values.implemented;
      progress.setAttribute("aria-label", `${framework}: ${values.implemented} of ${values.total} controls implemented`);

      article.append(heading, summary, progress);
      container.append(article);
    });
}


// Manages rotating governance messages while respecting reduced-motion preferences.
function initialiseRotatingMessages() {
  const output = document.getElementById("rotating-message");
  const previous = document.getElementById("previous-message");
  const next = document.getElementById("next-message");
  const toggle = document.getElementById("toggle-messages");

  if (!output || !previous || !next || !toggle) return;

  const m = dashboardState.metrics;

  // Uses live metrics when available, otherwise falls back to general messages.
  const messages = m ? [
    "Welcome to the GRC Hub - Rockwell Automation demonstration (Version 25)",
    `${m.risks} active risks monitored: ${m.inherentHigh} High inherent, ${m.high} High residual`,
    `${m.aboveAppetite} residual risks sit above the current appetite (≤ ${m.appetite})`,
    `${m.effectiveControls} of ${m.controls} controls are rated effective in design and operation`,
    `${m.reviewsOverdue} risk reviews are overdue`,
    `${m.implemented} of ${m.controls} controls are implemented`,
    `${m.useCases} registered AI use cases, with ${m.pending} pending review`,
    `${m.coverage}% of risks have mapped controls`,
    "Powered by ISO/IEC 27001, NIST CSF and AI governance principles"
  ] : [
    "Welcome to the GRC Hub",
    "Monitor risks, controls and AI governance from one place",
    "Use the CVE lookup to enrich vulnerability decisions",
    "Raise fictional governance requests through the Support Centre",
    "Powered by ISO/IEC 27001, NIST CSF and AI governance principles"
  ];

  // Wraps the message index so navigation cycles continuously.
  const show = index => {
    dashboardState.messageIndex = (index + messages.length) % messages.length;
    output.textContent = messages[dashboardState.messageIndex];
  };

  // Restarts automatic rotation unless paused or reduced motion is preferred.
  const restart = () => {
    window.clearInterval(dashboardState.timer);

    if (!dashboardState.paused && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dashboardState.timer = window.setInterval(() => show(dashboardState.messageIndex + 1), 6000);
    }
  };

  // Attach handlers only once to avoid duplicate event registrations.
  if (!dashboardState.handlersAttached) {
    previous.addEventListener("click", () => {
      show(dashboardState.messageIndex - 1);
      restart();
    });

    next.addEventListener("click", () => {
      show(dashboardState.messageIndex + 1);
      restart();
    });

    toggle.addEventListener("click", () => {
      dashboardState.paused = !dashboardState.paused;

      // Keeps the visible control state aligned with its accessible state.
      toggle.setAttribute("aria-pressed", String(dashboardState.paused));
      toggle.setAttribute(
        "aria-label",
        dashboardState.paused
          ? "Resume rotating governance messages"
          : "Pause rotating governance messages"
      );

      toggle.textContent = dashboardState.paused ? "▶" : "⏸";
      restart();
    });

    dashboardState.handlersAttached = true;
  }

  show(dashboardState.messageIndex);
  restart();
}


// Initialises fallback messages immediately, then loads live dashboard data.
initialiseRotatingMessages();
renderDashboard();








