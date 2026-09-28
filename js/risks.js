/* risks.js
Implements Risk Register rendering, visualisations and live CVE/EPSS lookups.
Baseline risk records remain separate from user-created entries, while
external threat intelligence informs rather than determines governance decisions.
*/

"use strict";

// Maps risk ratings to their visual badge styles.
const RISK_BADGE = {
  High: "badge--risk",
  Medium: "badge--warn",
  Low: "badge--ok",
};


// Keeps baseline and user-added risks separate; local entries are merged at runtime.
const RISK_STORAGE_KEY = "grc-hub-v25.user-risks";
let baselineRisks = [];
let userRisks = [];
let allRisks = [];
let allControls = [];


// Selects whether visualisations plot inherent or residual ratings (Version 25).
let visualBasis = "residual";

// Rebuilds the register and both visualisations from the merged risk dataset.
function refreshRiskViews() {
  allRisks = [...baselineRisks, ...userRisks];
  renderRiskRows(allRisks);
  renderHeatMap(allRisks);
  renderBubbleChart(allRisks);

  const clearButton = document.getElementById("clear-saved-risks");
  if (clearButton) clearButton.hidden = userRisks.length === 0;
}


/* ---------------------------------------------------------------------------
   VISUALISATION VIEW TOGGLE

   aria-pressed identifies the active view for both assistive technology
   and CSS styling.
--------------------------------------------------------------------------- */

const viewButtons = document.querySelectorAll(".view-toggle:not(.basis-toggle) .toggle-button");

viewButtons.forEach(button => {
  button.addEventListener("click", () => {
    viewButtons.forEach(other => {
      const isActive = other === button;
      other.setAttribute("aria-pressed", String(isActive));

      const view = document.getElementById(other.dataset.view);
      if (view) view.hidden = !isActive;
    });
  });
});


// Formats a likelihood x impact pair as readable text plus a band badge.
function scoreCell(likelihood, impact) {
  const cell = document.createElement("td");
  const score = (Number(likelihood) || 0) * (Number(impact) || 0);
  const band = riskBand(score);

  const text = document.createElement("span");
  text.className = "score-text";
  text.textContent = `L${likelihood} × I${impact} = ${score}`;

  cell.append(text, " ", makeBadge(band.label, band.badge));
  return cell;
}


// Renders risk records with inherent and residual ratings, control health,
// appetite-based treatment and review/monitoring status (Version 25).
function renderRiskRows(risks) {
  const tbody = document.getElementById("risk-rows");
  tbody.replaceChildren();

  const appetite = getRiskAppetite();
  const controlLookup = new Map(allControls.map(control => [control.id, control]));

  for (const risk of risks) {
    const row = document.createElement("tr");
    row.id = risk.id;

    // Risk ID
    const idCell = document.createElement("td");
    const ref = document.createElement("span");
    ref.className = "ref-id";
    ref.textContent = risk.id;
    idCell.append(ref);

    // Title with category
    const titleCell = document.createElement("td");
    const title = document.createElement("strong");
    title.textContent = risk.title;
    const category = document.createElement("span");
    category.className = "cell-meta";
    category.textContent = `${risk.category} · Owner: ${risk.owner}`;
    titleCell.append(title, category);

    // Inherent rating (before controls)
    const inherentCell = scoreCell(risk.likelihood, risk.impact);

    // Mitigating controls with their current health
    const controlsCell = document.createElement("td");
    const mappedControls = risk.controlIds || [];

    if (mappedControls.length === 0) {
      controlsCell.textContent = "No controls mapped";
    } else {
      const list = document.createElement("div");
      list.className = "reference-list";

      mappedControls.forEach(id => {
        const control = controlLookup.get(id);
        const item = document.createElement("a");
        item.className = "linked-reference record-link";
        item.href = `controls.html#${id}`;

        const health = control ? controlHealth(control) : {label: "Unknown", badge: ""};
        item.append(`${id} - ${control?.name || "Unknown control"} `, makeBadge(health.label, health.badge));
        list.append(item);
      });

      controlsCell.append(list);
    }

    // Residual rating (after controls)
    const residualCell = scoreCell(residualLikelihood(risk), residualImpact(risk));

    // Treatment: recorded decision, alignment with appetite and recommendation
    const treatmentCell = document.createElement("td");
    const recommendation = recommendTreatment(risk, appetite);
    const check = treatmentCheck(risk, appetite);

    const option = document.createElement("strong");
    option.textContent = risk.treatmentOption || "Mitigate";

    const plan = document.createElement("span");
    plan.className = "cell-meta";
    plan.textContent = risk.treatment;

    const recommended = document.createElement("span");
    recommended.className = "cell-meta";
    recommended.textContent = `Recommended: ${recommendation.recommended}. ${recommendation.detail}`;

    const appetiteBadge = makeBadge(
      recommendation.withinAppetite ? "Within appetite" : "Above appetite",
      recommendation.withinAppetite ? "badge--ok" : "badge--risk"
    );

    const checkLine = document.createElement("span");
    checkLine.className = "cell-meta";
    checkLine.append(makeBadge(check.label, check.badge));

    treatmentCell.append(option, " ", appetiteBadge, plan, checkLine, recommended);

    // Review date and monitoring (KRI)
    const reviewCell = document.createElement("td");
    const review = reviewStatus(risk);

    const next = document.createElement("strong");
    next.textContent = formatUKDate(review.next);

    const reviewMeta = document.createElement("span");
    reviewMeta.className = "cell-meta";
    reviewMeta.textContent = `${review.frequency} review · last ${formatUKDate(parseISODate(risk.lastReviewed))}`;

    const statusLine = document.createElement("span");
    statusLine.className = "cell-meta";
    statusLine.append(makeBadge(review.label, review.badge));

    const kri = document.createElement("span");
    kri.className = "cell-meta";
    kri.textContent = risk.kri ? `KRI: ${risk.kri}` : "KRI: not yet defined";

    reviewCell.append(next, statusLine, reviewMeta, kri);

    row.append(idCell, titleCell, inherentCell, controlsCell, residualCell, treatmentCell, reviewCell);
    tbody.append(row);
  }

  renderRiskSummary(risks, appetite);
}


// Summarises the register against the current appetite for the demonstration.
function renderRiskSummary(risks, appetite) {
  const container = document.getElementById("risk-summary");
  if (!container) return;

  const above = risks.filter(risk => !recommendTreatment(risk, appetite).withinAppetite).length;
  const signOff = risks.filter(risk => treatmentCheck(risk, appetite).badge === "badge--risk").length;
  const overdue = risks.filter(risk => reviewStatus(risk).state === "overdue").length;
  const dueSoon = risks.filter(risk => reviewStatus(risk).state === "soon").length;
  const inherentHigh = risks.filter(risk => riskBand(inherentScore(risk)).label === "High").length;
  const residualHigh = risks.filter(risk => riskBand(residualScore(risk)).label === "High").length;

  const items = [
    {value: `${inherentHigh} → ${residualHigh}`, label: "High risks: inherent → residual"},
    {value: String(above), label: `Residual above appetite (≤ ${appetite})`},
    {value: String(signOff), label: "Acceptances needing sign-off"},
    {value: String(overdue), label: "Risk reviews overdue"},
    {value: String(dueSoon), label: "Reviews due within 30 days"}
  ];

  container.replaceChildren();
  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "summary-tile";

    const value = document.createElement("span");
    value.className = "summary-value";
    value.textContent = item.value;

    const label = document.createElement("span");
    label.className = "summary-label";
    label.textContent = item.label;

    card.append(value, label);
    container.append(card);
  });
}


/* ---------------------------------------------------------------------------
   THREAT-INTELLIGENCE TO RISK MAPPING

   EPSS is used as a likelihood indicator and CVSS as an impact indicator.
   These are illustrative heuristics only: asset exposure and business
   context must still be assessed separately.
--------------------------------------------------------------------------- */

function likelihoodFromEpss(score) {
  if (!Number.isFinite(score)) return null;
  if (score >= 0.5) return 5;
  if (score >= 0.1) return 4;
  if (score >= 0.01) return 3;
  if (score >= 0.001) return 2;
  return 1;
}


function impactFromCvss(score) {
  if (!Number.isFinite(score)) return null;
  if (score >= 9) return 5;   // CVSS Critical
  if (score >= 7) return 4;   // CVSS High
  if (score >= 4) return 3;   // CVSS Medium
  if (score > 0) return 2;    // CVSS Low
  return 1;
}


// Creates a new locally stored risk from a CVE lookup result.
function addRiskFromLookup(cveId, likelihood, impact, button) {
  const nextNumber =
    Math.max(
      0,
      ...allRisks.map(
        risk => Number(risk.id.replace(/\D/g, "")) || 0
      )
    ) + 1;

  const risk = {
    id: `RSK-${String(nextNumber).padStart(3, "0")}`,
    title: `Vulnerability exposure: ${cveId}`,
    category: "Technical",
    likelihood,
    impact,
    rating: scoreBand(likelihood * impact).label,
    owner: "IT Operations Lead",
    treatment:
      "Assess and treat - imported from threat-intelligence lookup; confirm asset exposure before treating",
    cveId,
    controlIds: ["CTL-005", "CTL-007", "CTL-013"],
    // Version 25: residual equals inherent until controls are assessed.
    residualLikelihood: likelihood,
    residualImpact: impact,
    residualRating: scoreBand(likelihood * impact).label,
    treatmentOption: "Mitigate",
    lastReviewed: toISODate(todayMidnight()),
    kri: "Asset exposure confirmed and patch status tracked (target: remediated within SLA)",
  };

  userRisks.push(risk);

  const saved = saveStoredList(
    RISK_STORAGE_KEY,
    userRisks
  );

  refreshRiskViews();

  button.disabled = true;

  // The aria-live result region announces whether browser persistence succeeded.
  button.textContent = saved
    ? `Added as ${risk.id} (saved in this browser)`
    : `Added as ${risk.id} (this browser session only - storage unavailable)`;
}


// Builds the suggested register placement shown below a CVE result.
function buildRegisterSuggestion(cveId, cvssValue, epssScore) {
  const fragment = document.createDocumentFragment();

  const epssLikelihood = likelihoodFromEpss(epssScore);
  const cvssImpact = impactFromCvss(cvssValue);

  // Defaults to medium when a provider supplies no usable score.
  const likelihood = epssLikelihood ?? 3;
  const impact = cvssImpact ?? 3;
  const band = scoreBand(likelihood * impact);

  const heading = document.createElement("h4");
  heading.textContent = "Suggested register placement";
  fragment.append(heading);

  const explanation = document.createElement("p");

  const likelihoodSource =
    epssLikelihood === null
      ? "likelihood defaulted to 3 (no EPSS score)"
      : `likelihood ${likelihood} from the EPSS exploitation probability`;

  const impactSource =
    cvssImpact === null
      ? "impact defaulted to 3 (no CVSS score)"
      : `impact ${impact} from the CVSS base severity band`;

  explanation.textContent =
    `${likelihoodSource}; ${impactSource}. ` +
    `Score ${likelihood} x ${impact} = ${likelihood * impact} ` +
    `→ ${band.label.toLowerCase()} band.`;

  fragment.append(explanation);

  const caveat = document.createElement("p");
  caveat.className = "form-hint";
  caveat.textContent =
    "Heuristic only: EPSS estimates exploitation probability in the wild, not whether this asset is exposed, and CVSS measures technical severity, not business impact in context. Confirm both before relying on the placement.";

  fragment.append(caveat);

  const existing = allRisks.find(
    risk => risk.cveId === cveId
  );

  const button = document.createElement("button");
  button.type = "button";
  button.className = "add-risk-button";

  if (existing) {
    button.disabled = true;
    button.textContent =
      `Already on the register as ${existing.id}`;
  } else {
    button.textContent =
      `Add ${cveId} to the risk register`;

    button.addEventListener(
      "click",
      () => addRiskFromLookup(
        cveId,
        likelihood,
        impact,
        button
      )
    );
  }

  fragment.append(button);

  return fragment;
}


// Converts a likelihood × impact score into the prototype risk band.
function scoreBand(score) {
  if (score >= 15) {
    return {
      label: "High",
      className: "heat--high",
      colour: "var(--status-red)"
    };
  }

  if (score >= 8) {
    return {
      label: "Medium",
      className: "heat--medium",
      colour: "var(--status-amber)"
    };
  }

  return {
    label: "Low",
    className: "heat--low",
    colour: "var(--status-green)"
  };
}


// Groups risks by likelihood and impact position for both visualisations.
function groupByCell(risks) {
  const cells = new Map();

  for (const risk of risks) {
    const l = visualBasis === "residual" ? residualLikelihood(risk) : risk.likelihood;
    const i = visualBasis === "residual" ? residualImpact(risk) : risk.impact;

    if (
      !Number.isInteger(l) ||
      !Number.isInteger(i)
    ) {
      continue;
    }

    const key =
      `${l}-${i}`;

    if (!cells.has(key)) {
      cells.set(key, []);
    }

    cells.get(key).push(risk);
  }

  return cells;
}


// Builds the accessible likelihood × impact heat-map table.
function renderHeatMap(risks) {
  const container =
    document.getElementById("risk-heatmap");

  if (!container) return;

  container.replaceChildren();

  const cells = groupByCell(risks);

  const table =
    document.createElement("table");

  table.className = "heatmap-table";

  const caption =
    document.createElement("caption");

  caption.textContent =
    `${visualBasis === "residual" ? "Residual" : "Inherent"} risk heat map: rows are likelihood (5 high to 1 low), columns are impact (1 low to 5 high). Cells above the current appetite (≤ ${getRiskAppetite()}) are marked "above appetite".`;

  table.append(caption);

  // Builds the impact column headings.
  const thead =
    document.createElement("thead");

  const headRow =
    document.createElement("tr");

  const corner =
    document.createElement("th");

  corner.scope = "col";
  corner.textContent = "Likelihood \\ Impact";
  headRow.append(corner);

  for (
    let impact = 1;
    impact <= 5;
    impact++
  ) {
    const th =
      document.createElement("th");

    th.scope = "col";
    th.textContent = String(impact);
    headRow.append(th);
  }

  thead.append(headRow);
  table.append(thead);

  const tbody =
    document.createElement("tbody");

  for (
    let likelihood = 5;
    likelihood >= 1;
    likelihood--
  ) {
    const row =
      document.createElement("tr");

    const rowHeader =
      document.createElement("th");

    rowHeader.scope = "row";
    rowHeader.textContent =
      String(likelihood);

    row.append(rowHeader);

    for (
      let impact = 1;
      impact <= 5;
      impact++
    ) {
      const td =
        document.createElement("td");

      const band =
        scoreBand(likelihood * impact);

      td.className =
        `heat ${band.className}`;

      const aboveAppetite = likelihood * impact > getRiskAppetite();
      if (aboveAppetite) td.classList.add("heat--above-appetite");

      const inCell =
        cells.get(
          `${likelihood}-${impact}`
        ) || [];

      // Text conveys the score/risk information; colour is supplementary only.
      td.textContent = inCell.length
        ? inCell
            .map(risk => risk.id)
            .join(", ")
        : String(likelihood * impact);

      if (aboveAppetite) {
        const marker = document.createElement("span");
        marker.className = "visually-hidden";
        marker.textContent = " (above appetite)";
        td.append(marker);
      }

      if (inCell.length) {
        td.classList.add(
          "heat--occupied"
        );

        td.title = inCell
          .map(
            risk =>
              `${risk.id}: ${risk.title}`
          )
          .join("; ");
      }

      row.append(td);
    }

    tbody.append(row);
  }

  table.append(tbody);
  container.append(table);

  // Text labels ensure the legend does not rely on colour alone.
  const legend =
    document.createElement("p");

  legend.className = "heat-legend";

  for (const score of [4, 9, 16]) {
    const band = scoreBand(score);

    const swatch =
      document.createElement("span");

    swatch.className =
      `heat-swatch ${band.className}`;

    legend.append(
      swatch,
      ` ${band.label} `
    );
  }

  legend.append(
    "(score = likelihood x impact: 15+ high, 8-12 medium, ≤6 low). " +
    `Cells with a white-and-dark inner outline exceed the current risk appetite (≤ ${getRiskAppetite()}).`
  );

  container.append(legend);
}


// Creates namespaced SVG elements with supplied attributes.
function svgElement(name, attributes = {}) {
  const element =
    document.createElementNS(
      "http://www.w3.org/2000/svg",
      name
    );

  for (
    const [key, value]
    of Object.entries(attributes)
  ) {
    element.setAttribute(
      key,
      String(value)
    );
  }

  return element;
}


// Builds the visual bubble-chart alternative to the heat-map table.
function renderBubbleChart(risks) {
  const container =
    document.getElementById("risk-bubble");

  if (!container) return;

  container.replaceChildren();

  const cells = groupByCell(risks);

  const width = 520;
  const height = 400;

  const margin = {
    top: 20,
    right: 20,
    bottom: 55,
    left: 60
  };

  const plotWidth =
    width - margin.left - margin.right;

  const plotHeight =
    height - margin.top - margin.bottom;

  const xScale =
    value =>
      margin.left +
      ((value - 0.5) / 5) *
      plotWidth;

  const yScale =
    value =>
      margin.top +
      plotHeight -
      ((value - 0.5) / 5) *
      plotHeight;

  // The heat-map table exposes equivalent data, so the SVG is decorative.
  const svg = svgElement("svg", {
    viewBox: `0 0 ${width} ${height}`,
    class: "bubble-chart",
    "aria-hidden": "true",
    focusable: "false",
  });

  // Draws gridlines and axis tick labels.
  for (
    let value = 1;
    value <= 5;
    value++
  ) {
    svg.append(
      svgElement("line", {
        x1: xScale(value),
        y1: margin.top,
        x2: xScale(value),
        y2: margin.top + plotHeight,
        class: "bubble-grid",
      })
    );

    svg.append(
      svgElement("line", {
        x1: margin.left,
        y1: yScale(value),
        x2: margin.left + plotWidth,
        y2: yScale(value),
        class: "bubble-grid",
      })
    );

    const xTick =
      svgElement("text", {
        x: xScale(value),
        y:
          margin.top +
          plotHeight +
          22,
        class: "bubble-tick",
        "text-anchor": "middle"
      });

    xTick.textContent =
      String(value);

    svg.append(xTick);

    const yTick =
      svgElement("text", {
        x: margin.left - 12,
        y: yScale(value) + 4,
        class: "bubble-tick",
        "text-anchor": "end"
      });

    yTick.textContent =
      String(value);

    svg.append(yTick);
  }

  // Adds axis titles.
  const xTitle =
    svgElement("text", {
      x:
        margin.left +
        plotWidth / 2,
      y: height - 12,
      class: "bubble-axis",
      "text-anchor": "middle"
    });

  xTitle.textContent = "Impact →";
  svg.append(xTitle);

  const yTitle =
    svgElement("text", {
      x: 16,
      y:
        margin.top +
        plotHeight / 2,
      class: "bubble-axis",
      "text-anchor": "middle",
      transform:
        `rotate(-90 16 ${margin.top + plotHeight / 2})`,
    });

  yTitle.textContent =
    "Likelihood →";

  svg.append(yTitle);

  // Bubble area scales with the number of risks sharing a matrix position.
  for (
    const [key, inCell]
    of cells
  ) {
    const [
      likelihood,
      impact
    ] = key
      .split("-")
      .map(Number);

    const band =
      scoreBand(
        likelihood * impact
      );

    const radius =
      16 *
      Math.sqrt(
        inCell.length
      );

    const group =
      svgElement("g");

    const circle =
      svgElement("circle", {
        cx: xScale(impact),
        cy: yScale(likelihood),
        r: radius,
        fill: band.colour,
        "fill-opacity": "0.75",
        stroke: band.colour,
        "stroke-width": "2",
      });

    // Provides a native tooltip listing risks within the bubble.
    const tooltip =
      svgElement("title");

    tooltip.textContent =
      inCell
        .map(
          risk =>
            `${risk.id}: ${risk.title}`
        )
        .join("; ");

    circle.append(tooltip);
    group.append(circle);

    const label =
      svgElement("text", {
        x: xScale(impact),
        y:
          yScale(likelihood) +
          5,
        class: "bubble-count",
        "text-anchor": "middle",
      });

    label.textContent =
      String(inCell.length);

    group.append(label);
    svg.append(group);
  }

  container.append(svg);
}


// Loads baseline datasets and merges any browser-saved risks.
async function initRisks() {
  try {
    [baselineRisks, allControls] =
      await Promise.all([
        loadJSON("data/risks.json"),
        loadJSON("data/controls.json"),
      ]);

    userRisks =
      loadStoredList(
        RISK_STORAGE_KEY
      );

    refreshRiskViews();

  } catch (error) {
    const row =
      document.createElement("tr");

    const cell =
      document.createElement("td");

    cell.colSpan = 7;
    cell.className = "empty-state";

    cell.textContent =
      `Risks could not be loaded. Serve the site over http. (${error.message})`;

    row.append(cell);

    document
      .getElementById("risk-rows")
      .append(row);
  }
}


// Clears user-added risks while preserving the baseline dataset.
document
  .getElementById("clear-saved-risks")
  ?.addEventListener(
    "click",
    () => {
      userRisks = [];

      clearStoredList(
        RISK_STORAGE_KEY
      );

      refreshRiskViews();
    }
  );


// Exports the complete current risk register as CSV.
document
  .getElementById("download-risks")
  ?.addEventListener(
    "click",
    () => {
      const rows = [
        [
          "Risk ID",
          "Title",
          "Category",
          "Owner role",
          "Inherent likelihood",
          "Inherent impact",
          "Inherent score",
          "Inherent rating",
          "Residual likelihood",
          "Residual impact",
          "Residual score",
          "Residual rating",
          "Risk appetite (max residual)",
          "Within appetite",
          "Treatment option",
          "Treatment plan",
          "Recommended treatment",
          "Treatment check",
          "Mitigating controls",
          "Review frequency",
          "Last reviewed",
          "Next review",
          "Review status",
          "Key risk indicator",
          "Source CVE"
        ],

        ...allRisks.map(risk => {
          const appetite = getRiskAppetite();
          const rec = recommendTreatment(risk, appetite);
          const review = reviewStatus(risk);
          return [
            risk.id,
            risk.title,
            risk.category,
            risk.owner,
            risk.likelihood,
            risk.impact,
            inherentScore(risk),
            riskBand(inherentScore(risk)).label,
            residualLikelihood(risk),
            residualImpact(risk),
            residualScore(risk),
            riskBand(residualScore(risk)).label,
            appetite,
            rec.withinAppetite ? "Yes" : "No",
            risk.treatmentOption || "Mitigate",
            risk.treatment,
            rec.recommended,
            treatmentCheck(risk, appetite).label,
            (risk.controlIds || []).join("; "),
            review.frequency,
            risk.lastReviewed || "",
            review.next ? toISODate(review.next) : "",
            review.label,
            risk.kri || "",
            risk.cveId || "",
          ];
        }),
      ];

      downloadCSV(
        "risk-register.csv",
        rows
      );
    }
  );


// Extracts the best available English vulnerability description.
function firstEnglishDescription(cve) {
  if (
    typeof cve.summary === "string"
  ) {
    return cve.summary;
  }

  if (
    typeof cve.details === "string"
  ) {
    return cve.details;
  }

  const descriptions =
    cve.containers?.cna?.descriptions ||
    cve.cve?.descriptions ||
    cve.descriptions;

  if (
    Array.isArray(
      descriptions
    )
  ) {
    return (
      descriptions.find(
        item =>
          item.lang === "en"
      )?.value ||
      descriptions[0]?.value
    );
  }

  return "No description was supplied by the vulnerability provider.";
}


// Searches supported CVE response structures for a numeric CVSS base score.
function extractCvssValue(cve) {
  // CVSS metrics may appear in CNA or ADP containers depending on the record.
  const metricGroups = [
    ...(
      cve.containers?.cna
        ?.metrics || []
    ),

    ...(
      cve.containers?.adp ||
      []
    ).flatMap(
      container =>
        container.metrics ||
        []
    ),
  ];

  const metricScore =
    metricGroups
      .map(
        metric =>
          metric?.cvssV4_0
            ?.baseScore ??
          metric?.cvssV3_1
            ?.baseScore ??
          metric?.cvssV3_0
            ?.baseScore ??
          metric?.cvssV2_0
            ?.baseScore
      )
      .find(
        value =>
          typeof value ===
          "number"
      );

  // Supports several common provider response shapes.
  const candidates = [
    cve.cvss,
    cve.cvss3,
    cve.cvssScore,

    cve.metrics
      ?.cvssMetricV31?.[0]
      ?.cvssData?.baseScore,

    cve.metrics
      ?.cvssMetricV30?.[0]
      ?.cvssData?.baseScore,

    cve.cve?.metrics
      ?.cvssMetricV31?.[0]
      ?.cvssData?.baseScore,

    cve.cve?.metrics
      ?.cvssMetricV30?.[0]
      ?.cvssData?.baseScore,

    metricScore,
  ];

  const raw =
    candidates.find(
      value =>
        value !== undefined &&
        value !== null &&
        value !== ""
    );

  const score =
    Number(raw);

  return Number.isFinite(score)
    ? score
    : null;
}


// Formats the extracted CVSS score for display.
function extractCvss(cve) {
  const score =
    extractCvssValue(cve);

  return score === null
    ? "Not supplied"
    : String(score);
}


// Adds a term/value pair to the result definition list.
function addDefinition(container, term, value) {
  const dt =
    document.createElement("dt");

  dt.textContent = term;

  const dd =
    document.createElement("dd");

  if (
    value instanceof Node
  ) {
    dd.append(value);
  } else {
    dd.textContent = value;
  }

  container.append(dt, dd);
}


// Converts EPSS probability into an illustrative exploitation-priority band.
function epssRisk(score) {
  // Rejects missing or malformed values rather than treating them as Low.
  if (
    score === null ||
    !Number.isFinite(score)
  ) {
    return {
      label: "Unavailable",
      className: ""
    };
  }

  if (score >= 0.5) {
    return {
      label: "High",
      className: "badge--risk"
    };
  }

  if (score >= 0.1) {
    return {
      label: "Medium",
      className: "badge--warn"
    };
  }

  return {
    label: "Low",
    className: "badge--ok"
  };
}


// Renders available CVE/EPSS intelligence, including partial results.
function renderLookupResult(
  cveId,
  cve,
  epssRecord,
  notes = []
) {
  const region =
    document.getElementById(
      "cve-results"
    );

  region.replaceChildren();

  const article =
    document.createElement(
      "article"
    );

  article.className =
    "result-card";

  const heading =
    document.createElement("h3");

  const ref =
    document.createElement(
      "span"
    );

  ref.className = "ref-id";
  ref.textContent = cveId;

  heading.append(
    "Threat intelligence for ",
    ref
  );

  // Shows usable information even when one external provider is unavailable.
  const description =
    document.createElement("p");

  description.textContent = cve
    ? firstEnglishDescription(cve)
    : "Vulnerability description unavailable - showing exploit-prediction data only.";

  const list =
    document.createElement("dl");

  list.className =
    "result-details";

  addDefinition(
    list,
    "CVSS base score",
    cve
      ? extractCvss(cve)
      : "Not available"
  );

  const score =
    epssRecord
      ? Number(epssRecord.epss)
      : null;

  const percentile =
    epssRecord
      ? Number(
          epssRecord.percentile
        )
      : null;

  // Only renders percentages when provider values are valid numbers.
  addDefinition(
    list,
    "EPSS probability",
    Number.isFinite(score)
      ? `${(score * 100).toFixed(2)}%`
      : "Not available"
  );

  addDefinition(
    list,
    "EPSS percentile",
    Number.isFinite(percentile)
      ? `${(percentile * 100).toFixed(2)}%`
      : "Not available"
  );

  const assessment =
    epssRisk(score);

  const assessmentBadge =
    document.createElement(
      "span"
    );

  assessmentBadge.className =
    `badge ${assessment.className}`;

  assessmentBadge.textContent =
    assessment.label;

  addDefinition(
    list,
    "Prototype exploitation priority",
    assessmentBadge
  );

  if (epssRecord?.date) {
    addDefinition(
      list,
      "EPSS score date",
      epssRecord.date
    );
  }

  const note =
    document.createElement("p");

  note.className =
    "form-hint";

  note.textContent =
    "EPSS estimates exploitation probability; it does not replace asset context, impact assessment or professional judgement.";

  article.append(
    heading,
    description,
    list
  );

  // Provider-specific caveats prevent partial data being mistaken for complete data.
  for (
    const noteText of notes
  ) {
    const caveat =
      document.createElement("p");

    caveat.className =
      "form-hint error-message";

    caveat.textContent =
      noteText;

    article.append(caveat);
  }

  // Adds a traceable suggested risk-register placement.
  article.append(
    buildRegisterSuggestion(
      cveId,
      cve
        ? extractCvssValue(cve)
        : null,
      score
    )
  );

  article.append(note);
  region.append(article);
}


// Fetches JSON and enriches errors with provider-specific details.
async function fetchJSON(
  url,
  providerName
) {
  const response =
    await fetch(
      url,
      {
        headers: {
          Accept:
            "application/json"
        }
      }
    );

  if (!response.ok) {
    const error =
      new Error(
        `${providerName} returned HTTP ${response.status}`
      );

    error.status =
      response.status;

    error.provider =
      providerName;

    error.retryAfter =
      response.headers.get(
        "Retry-After"
      );

    throw error;
  }

  return response.json();
}


/* ---------------------------------------------------------------------------
   PROVIDER CACHE

   Reuses API responses during the current page session to reduce duplicate
   requests and exposure to rate limiting.
--------------------------------------------------------------------------- */

const providerCache =
  new Map();


// Returns cached provider data when available, otherwise performs the request.
async function cachedFetchJSON(
  cacheKey,
  url,
  providerName
) {
  if (
    providerCache.has(
      cacheKey
    )
  ) {
    return providerCache.get(
      cacheKey
    );
  }

  const value =
    await fetchJSON(
      url,
      providerName
    );

  providerCache.set(
    cacheKey,
    value
  );

  return value;
}


// Converts provider errors into user-friendly status messages.
function friendlyProviderError(error) {
  if (
    error?.status === 429
  ) {
    const wait =
      error.retryAfter
        ? `about ${error.retryAfter} seconds`
        : "a minute or two";

    return (
      `${error.provider} is rate limiting requests ` +
      `(HTTP 429 Too Many Requests) — the free service allows a limited ` +
      `number of lookups per minute per IP address, so wait ${wait} before retrying`
    );
  }

  return (
    error?.message ||
    String(error)
  );
}


/* ---------------------------------------------------------------------------
   RECENT CVE SUGGESTIONS

   Loads recent identifiers from CIRCL while retaining full manual entry
   if the external service is unavailable or rate limited.
--------------------------------------------------------------------------- */


// Extracts and normalises CVE identifiers from supported provider response shapes.
function extractRecentCveIds(payload) {
  const records =
    Array.isArray(payload)
      ? payload
      : Array.isArray(
          payload?.data
        )
        ? payload.data
        : Array.isArray(
            payload?.results
          )
          ? payload.results
          : [];

  const ids =
    records
      .map(record => {
        if (
          typeof record ===
          "string"
        ) {
          return record;
        }

        // CIRCL may return [identifier, source] pairs.
        if (
          Array.isArray(record)
        ) {
          return record[0];
        }

        return (
          record?.id ||
          record?.cve ||
          record?.cveId ||
          record?.cveMetadata
            ?.cveId ||
          record?.CVE
        );
      })
      .filter(
        value =>
          /^CVE-\d{4}-\d{4,}$/i
            .test(
              String(
                value || ""
              )
            )
      )
      .map(
        value =>
          String(value)
            .toUpperCase()
      );

  return [
    ...new Set(ids)
  ].slice(0, 25);
}


// Loads recent CVE suggestions using sessionStorage and API caching where possible.
async function loadRecentCveSuggestions() {
  const datalist =
    document.getElementById(
      "recent-cve-options"
    );

  const status =
    document.getElementById(
      "recent-cve-status"
    );

  if (
    !datalist ||
    !status
  ) {
    return;
  }

  const cacheKey =
    "grcRecentCvesV25";

  let ids = [];

  // sessionStorage is optional; failure does not prevent manual entry.
  try {
    const cached =
      sessionStorage.getItem(
        cacheKey
      );

    if (cached) {
      ids =
        JSON.parse(cached);
    }

  } catch {
    /* session storage is optional */
  }

  if (
    !Array.isArray(ids) ||
    ids.length === 0
  ) {
    try {
      const payload =
        await cachedFetchJSON(
          "CIRCL:recent",
          "https://cve.circl.lu/api/vulnerability/last/25?light=1",
          "CIRCL recent CVEs"
        );

      ids =
        extractRecentCveIds(
          payload
        );

      if (
        ids.length === 0
      ) {
        throw new Error(
          "The service returned no recognisable CVE identifiers"
        );
      }

      try {
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify(ids)
        );
      } catch {
        /* optional */
      }

    } catch (error) {
      status.textContent =
        `Recent CVE suggestions could not be loaded (${friendlyProviderError(error)}). You can still enter a CVE identifier manually.`;

      status.classList.add(
        "error-message"
      );

      return;
    }
  }

  datalist.replaceChildren(
    ...ids.map(id => {
      const option =
        document.createElement(
          "option"
        );

      option.value = id;
      return option;
    })
  );

  status.textContent =
    `${ids.length} recent CVE suggestions are available. Select one or enter another valid identifier.`;

  status.classList.remove(
    "error-message"
  );
}


const lookupForm =
  document.getElementById(
    "cve-lookup"
  );


// Validates the CVE identifier and queries CIRCL and FIRST EPSS independently.
lookupForm.addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    const input =
      document.getElementById(
        "cve-id"
      );

    const cveId =
      input.value
        .trim()
        .toUpperCase();

    input.value = cveId;

    if (
      !lookupForm.checkValidity()
    ) {
      input.setAttribute(
        "aria-invalid",
        "true"
      );

      const error =
        document.getElementById(
          "cve-id-error"
        );

      if (error) {
        error.hidden = false;

        error.textContent =
          "Enter a CVE identifier in the format CVE-YYYY-NNNN.";
      }

      lookupForm.reportValidity();
      return;
    }

    input.removeAttribute(
      "aria-invalid"
    );

    const inputError =
      document.getElementById(
        "cve-id-error"
      );

    if (inputError) {
      inputError.hidden = true;
    }

    const submitButton =
      document.getElementById(
        "cve-submit"
      ) ||
      lookupForm.querySelector(
        "button[type='submit']"
      );

    const originalLabel =
      submitButton.textContent;

    const region =
      document.getElementById(
        "cve-results"
      );

    // Provides visible and programmatic loading feedback during the request.
    submitButton.disabled = true;
    submitButton.textContent =
      "Looking up…";

    submitButton.setAttribute(
      "aria-disabled",
      "true"
    );

    region.setAttribute(
      "aria-busy",
      "true"
    );

    region.textContent =
      `Looking up ${cveId} across CIRCL and FIRST EPSS…`;

    try {
      // Allows useful partial results if either external provider fails.
      const [
        circlResult,
        epssResult
      ] =
        await Promise.allSettled([
          cachedFetchJSON(
            `CIRCL:${cveId}`,
            `https://cve.circl.lu/api/cve/${encodeURIComponent(cveId)}`,
            "CIRCL"
          ),

          cachedFetchJSON(
            `EPSS:${cveId}`,
            `https://api.first.org/data/v1/epss?cve=${encodeURIComponent(cveId)}`,
            "FIRST EPSS"
          ),
        ]);

      let cve = null;
      const notes = [];

      if (
        circlResult.status ===
        "fulfilled"
      ) {
        const record =
          circlResult.value;

        if (
          record &&
          (
            record.id ||
            record.cveMetadata ||
            record.cve ||
            record.summary ||
            record.details
          )
        ) {
          cve = record;
        } else {
          notes.push(
            "CIRCL returned no vulnerability record for that identifier — check that it exists."
          );
        }

      } else {
        notes.push(
          `CVE details unavailable: ${friendlyProviderError(circlResult.reason)}.`
        );
      }

      let epssRecord = null;

      if (
        epssResult.status ===
        "fulfilled"
      ) {
        epssRecord =
          Array.isArray(
            epssResult.value.data
          )
            ? epssResult.value.data[0]
            : null;

        if (!epssRecord) {
          notes.push(
            "FIRST EPSS holds no score for that identifier (scores exist only for published CVEs)."
          );
        }

      } else {
        notes.push(
          `EPSS score unavailable: ${friendlyProviderError(epssResult.reason)}.`
        );
      }

      // A complete failure is shown only when neither provider returns usable data.
      if (
        !cve &&
        !epssRecord
      ) {
        region.replaceChildren();

        const message =
          document.createElement(
            "p"
          );

        message.className =
          "error-message";

        message.textContent =
          `The lookup could not be completed. ${notes.join(" ")}`;

        region.append(message);
        return;
      }

      renderLookupResult(
        cveId,
        cve,
        epssRecord,
        notes
      );

    } finally {
      // Restores the interface regardless of lookup success or failure.
      region.setAttribute(
        "aria-busy",
        "false"
      );

      submitButton.disabled =
        false;

      submitButton.removeAttribute(
        "aria-disabled"
      );

      submitButton.textContent =
        originalLabel;
    }
  }
);


/* ---------------------------------------------------------------------------
   VERSION 25: RISK APPETITE AND VISUALISATION BASIS
--------------------------------------------------------------------------- */

const appetiteSelect = document.getElementById("risk-appetite");
const appetiteStatus = document.getElementById("risk-appetite-status");

function describeAppetite() {
  const level = appetiteLevel(getRiskAppetite());
  if (appetiteStatus) {
    appetiteStatus.textContent =
      `Current appetite: ${level.label} - ${level.description}. Treatment recommendations, the summary and the heat map reflect this setting.`;
  }
}

if (appetiteSelect) {
  appetiteSelect.value = String(getRiskAppetite());
  appetiteSelect.addEventListener("change", () => {
    setRiskAppetite(Number(appetiteSelect.value));
    describeAppetite();
    refreshRiskViews();
  });
}

document.querySelectorAll(".basis-toggle .toggle-button").forEach(button => {
  button.addEventListener("click", () => {
    visualBasis = button.dataset.basis;
    document.querySelectorAll(".basis-toggle .toggle-button").forEach(other =>
      other.setAttribute("aria-pressed", String(other === button))
    );
    renderHeatMap(allRisks);
    renderBubbleChart(allRisks);
  });
});


// Loads optional CVE suggestions, then initialises the risk register.
loadRecentCveSuggestions();

describeAppetite();
initRisks();

