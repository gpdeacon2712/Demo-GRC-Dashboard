/* controls.js  (Version 25 - Rockwell Automation demonstration)
   Implements the Control Library with filtering, clause-level framework
   mapping, design and operating effectiveness, control health,
   linked-risk visibility and CSV export. */

"use strict";

// Maps implementation status values to their visual badge styles.
const STATUS_BADGE={"Implemented":"badge--ok","In progress":"badge--warn","Not implemented":"badge--risk"};

let allControls=[],allRisks=[],visibleControls=[];


// Builds links to risks associated with each control.
function makeRefList(ids,lookup,emptyText){
 const wrap=document.createElement("div"); wrap.className="reference-list";

 if(!ids?.length){
  wrap.textContent=emptyText;
  return wrap;
 }

 ids.forEach(id=>{
  const item=document.createElement("a");
  item.className="linked-reference record-link";
  item.href=`risks.html#${id}`;
  item.textContent=`${id} — ${lookup.get(id)?.title||"Unknown risk"}`;
  wrap.append(item);
 });

 return wrap;
}


// Lists the framework clauses / requirements each control satisfies.
function makeClauseList(control){
 const clauses=control.frameworkClauses||[];

 if(!clauses.length){
  const fallback=document.createElement("span");
  fallback.textContent=(control.frameworks||[]).join(", ");
  return fallback;
 }

 const list=document.createElement("ul");
 list.className="clause-list";

 clauses.forEach(clause=>{
  const item=document.createElement("li");
  const ref=document.createElement("span");
  ref.className="clause-ref";
  ref.textContent=`${clause.framework} ${clause.ref}`;
  item.append(ref,` — ${clause.title}`);
  list.append(item);
 });

 return list;
}


// Builds a cell showing a labelled effectiveness result.
function effectivenessCell(value){
 const cell=document.createElement("td");
 cell.append(makeBadge(value||"Not assessed",EFFECTIVENESS_BADGE[value]||""));
 return cell;
}


// Renders the current Control Library rows and updates the result count.
function renderControlRows(controls){
 visibleControls=controls;

 const tbody=document.getElementById("control-rows");
 tbody.replaceChildren();

 const riskLookup=new Map(allRisks.map(r=>[r.id,r]));

 for(const control of controls){
  const row=document.createElement("tr");
  row.id=control.id;

  const idCell=document.createElement("td"),
        idRef=document.createElement("span");

  idRef.className="ref-id";
  idRef.textContent=control.id;
  idCell.append(idRef);

  const name=document.createElement("td");
  const nameText=document.createElement("strong");
  nameText.textContent=control.name;
  const owner=document.createElement("span");
  owner.className="cell-meta";
  owner.textContent=`Owner: ${control.owner}`;
  name.append(nameText,owner);

  const frameworks=document.createElement("td");
  frameworks.append(makeClauseList(control));

  const status=document.createElement("td");
  status.append(makeBadge(control.status,STATUS_BADGE[control.status]));

  const design=effectivenessCell(control.designEffectiveness);
  const operating=effectivenessCell(control.operatingEffectiveness);

  // Overall health, test dates and the latest test finding.
  const healthCell=document.createElement("td");
  const health=controlHealth(control);
  const test=controlTestStatus(control);

  const tested=document.createElement("span");
  tested.className="cell-meta";
  tested.textContent=control.lastTested
   ? `Last tested ${formatUKDate(parseISODate(control.lastTested))} (${control.testMethod})`
   : "Not yet tested";

  const testLine=document.createElement("span");
  testLine.className="cell-meta";
  testLine.append(test.overdue?makeBadge(test.label,"badge--risk"):test.label);

  const note=document.createElement("span");
  note.className="cell-meta";
  note.textContent=control.testNote||"";

  healthCell.append(makeBadge(health.label,health.badge),tested,testLine,note);

  const risks=document.createElement("td");
  risks.append(makeRefList(control.riskIds,riskLookup,"No risks currently mapped"));

  row.append(idCell,name,frameworks,status,design,operating,healthCell,risks);
  tbody.append(row);
 }

 document.getElementById("control-count").textContent=
  `${controls.length} control${controls.length===1?"":"s"} shown.`;

 renderControlSummary();
}


// Summarises control health across the whole library.
function renderControlSummary(){
 const container=document.getElementById("control-summary");
 if(!container) return;

 const count=label=>allControls.filter(c=>controlHealth(c).label===label).length;
 const overdue=allControls.filter(c=>controlTestStatus(c).overdue).length;

 const items=[
  {value:String(count("Effective")),label:"Effective (design and operating)"},
  {value:String(count("Needs improvement")),label:"Needs improvement"},
  {value:String(count("Ineffective")),label:"Ineffective or not operating"},
  {value:String(count("Not fully assessed")),label:"Not fully assessed"},
  {value:String(overdue),label:"Control tests overdue"}
 ];

 container.replaceChildren();
 items.forEach(item=>{
  const tile=document.createElement("div");
  tile.className="summary-tile";
  const value=document.createElement("span");
  value.className="summary-value";
  value.textContent=item.value;
  const label=document.createElement("span");
  label.className="summary-label";
  label.textContent=item.label;
  tile.append(value,label);
  container.append(tile);
 });
}


// Filters controls by search text, framework, status and health.
function applyFilters(){
 const text=document.getElementById("filter-text").value.trim().toLowerCase(),
       framework=document.getElementById("filter-framework").value,
       status=document.getElementById("filter-status").value,
       health=document.getElementById("filter-health")?.value||"";

 // Risk IDs, titles and clause references are searchable.
 const riskLookup=new Map(allRisks.map(r=>[r.id,r.title]));

 const filtered=allControls.filter(c=>{
  const linked=(c.riskIds||[])
   .map(id=>`${id} ${riskLookup.get(id)||""}`)
   .join(" ");

  const clauses=(c.frameworkClauses||[])
   .map(cl=>`${cl.framework} ${cl.ref} ${cl.title}`)
   .join(" ");

  const searchable=
   `${c.id} ${c.name} ${c.owner} ${linked} ${clauses}`.toLowerCase();

  return(!text||searchable.includes(text))
   &&(!framework||c.frameworks.includes(framework))
   &&(!status||c.status===status)
   &&(!health||controlHealth(c).label===health);
 });

 renderControlRows(filtered);

 // Displays a table message when no records match the selected filters.
 if(!filtered.length){
  const row=document.createElement("tr"),
        cell=document.createElement("td");

  cell.colSpan=8;
  cell.className="empty-state";
  cell.textContent="No controls match the selected filters.";

  row.append(cell);
  document.getElementById("control-rows").append(row);
 }
}


// Applies filtering immediately when a search or filter value changes.
["filter-text","filter-framework","filter-status","filter-health"].forEach(id=>
 document.getElementById(id)?.addEventListener(
  id==="filter-text"?"input":"change",
  applyFilters
 )
);


// Exports the currently visible controls as a CSV file.
document.getElementById("download-controls")?.addEventListener("click",()=>
 downloadCSV(
  "control-library.csv",
  [
   ["Control ID","Name","Owner role","Status","Framework clauses satisfied","Design effectiveness","Operating effectiveness","Control health","Last tested","Test method","Next test","Test finding","Risks mitigated"],
   ...visibleControls.map(c=>[
    c.id,
    c.name,
    c.owner,
    c.status,
    (c.frameworkClauses||[]).map(cl=>`${cl.framework} ${cl.ref} ${cl.title}`).join("; "),
    c.designEffectiveness||"Not assessed",
    c.operatingEffectiveness||"Not assessed",
    controlHealth(c).label,
    c.lastTested||"",
    c.testMethod||"",
    c.nextTest||"",
    c.testNote||"",
    (c.riskIds||[]).join("; ")
   ])
  ]
 )
);


// Loads control and risk datasets together so risk names can be linked to controls.
async function initControls(){
 try{
  [allControls,allRisks]=await Promise.all([
   loadJSON("data/controls.json"),
   loadJSON("data/risks.json")
  ]);

  renderControlRows(allControls);

 }catch(error){
  document.getElementById("control-count").textContent=
   `Controls could not be loaded — serve the site over http (see README). (${error.message})`;
 }
}


// Starts the Control Library once the script loads.
initControls();
