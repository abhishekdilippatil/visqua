import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { DM } from "./DataManager.js";

const Q1X2_COLS = ["Q1x2_1","Q1x2_2","Q1x2_3","Q1x2_4","Q1x2_5","Q1x2_6","Q1x2_7","Q1x2_8","Q1x2_9","Q1x2_10","Q1x2_11","Q1x2_12","Q1x2_13"];
const Q5_COLS = ["Q5_1","Q5_2","Q5_3","Q5_4","Q5_5","Q5_6","Q5_7","Q5_8","Q5_9","Q5_10","Q5_11","Q5_12"];

const SHORT_LABELS = {
  Q1x2_1: "digle",
  Q1x2_2: "phyle",
  Q1x2_3: "email",
  Q1x2_4: "selfd",
  Q1x2_5: "dbook",
  Q1x2_6: "bbook",
  Q1x2_7: "games",
  Q1x2_8: "simul",
  Q1x2_9: "dtips",
  Q1x2_10: "broch",
  Q1x2_11: "ptips",
  Q1x2_12: "pcast",
  Q1x2_13: "other",
  Q5_1: "phyle",
  Q5_2: "digle",
  Q5_3: "email",
  Q5_4: "selfd",
  Q5_5: "dbook",
  Q5_6: "games",
  Q5_7: "simul",
  Q5_8: "dtips",
  Q5_9: "broch",
  Q5_10: "ptips",
  Q5_11: "pcast",
  Q5_12: "other"
};

const APPRECIATION_CONFIG = [
  { key: "Low", label: "Low (1-2)", range: [1, 2] },
  { key: "Medium", label: "Medium (3-4)", range: [3, 4] },
  { key: "High", label: "High (5-6)", range: [5, 6] }
];

const Q5_ORDER = ["Q5_2", "Q5_1", "Q5_3", "Q5_4", "Q5_5", "Q5_6", "Q5_7", "Q5_8", "Q5_9", "Q5_10", "Q5_11", "Q5_12"];

// Filter key for this chart
const RADIAL_SOURCE = "radial";

const tooltip = d3.select("#tooltip");

// Only used inside this chart
let activeAppreciationLevels = [];
function getColorById(columnId) {
  const label = SHORT_LABELS[columnId];

  if (label === "digle") return "#e11d48";
  if (label === "phyle") return "#2563eb";
  if (label === "email") return "#facc15";
  if (label === "selfd") return "#22c55e";
  if (label === "dbook") return "#a855f7";
  if (label === "bbook") return "#f97316";
  if (label === "games") return "#78350f";
  if (label === "simul") return "#64748b";
  if (label === "dtips") return "#ec4899";
  if (label === "broch") return "#fb923c";
  if (label === "ptips") return "#BE9904";
  if (label === "pcast") return "#06b6d4";
  if (label === "other") return "#d9f99d";
  return "#cbd5e1";
}
let globalMaxCorr = null;

// Get this chart filter
function getRadialFilter() {
  return DM.getFilterBySource ? DM.getFilterBySource(RADIAL_SOURCE) : null;
}

function getActiveParentId() {
  const filter = getRadialFilter();
  if (!filter) return null;

  if (filter.kind === "q5_ranked") return filter.col || null;
  if (filter.kind === "q1x2_rated") return filter.q5Col || null;

  return null;
}



// Check selected stack
function isSelectedStackSegment(d, level) {
  const filter = getRadialFilter();
  if (!filter || filter.kind !== "q1x2_rated") return false;

  return filter.q5Col === d.parentId &&
         filter.col === d.q1Id &&
         String(filter.level || "").toLowerCase() === String(level || "").toLowerCase();
}

// Apply parent filter
function toggleParentFilter(parentId) {
  const active = getRadialFilter();

  const nextFilter = {
    kind: "q5_ranked",
    col: parentId,
    ranks: [1, 2, 3]
  };

  const isSame = active?.kind === "q5_ranked" &&
    active?.col === parentId &&
    Array.isArray(active?.ranks) &&
    active.ranks.join(",") === "1,2,3";

  if (isSame) {
    DM.clearFilterSource(RADIAL_SOURCE);
  } else {
    DM.setFilter(nextFilter, RADIAL_SOURCE);
  }
}

// Apply stack filter
function toggleStackFilter(d, level) {
  const active = getRadialFilter();

  const nextFilter = {
    kind: "q1x2_rated",
    col: d.q1Id,
    level: String(level || "").toLowerCase(),
    q5Col: d.parentId,
    q5Ranks: [1, 2, 3]
  };

  const isSame = active?.kind === "q1x2_rated" &&
    active?.col === nextFilter.col &&
    active?.q5Col === nextFilter.q5Col &&
    String(active?.level || "").toLowerCase() === nextFilter.level;

  if (isSame) {
    DM.clearFilterSource(RADIAL_SOURCE);
  } else {
    DM.setFilter(nextFilter, RADIAL_SOURCE);
  }
}

function labelText(headerRow, colName) {
  if (SHORT_LABELS[colName]) return SHORT_LABELS[colName];

  const raw = headerRow?.[colName];
  if (!raw) return colName;

  return raw.split("[")[0].trim() || colName;
}

function cleanLongLabel(text) {
  if (!text) return "";

  return text
    .replace(/\[To what extent did you appreciate.*?\]/gi, "")
    .replace(/\[PART 3.*?\]/gi, "")
    .replace(/How would you prefer to receive.*?1 is your top favorite\.\)/gi, "")
    .replace(/Answer the questions based on the preferences.*?\]/gi, "")
    .replace(/\[.*?\]/g, "")
    .trim();
}

function likert(v) {
  return (v == null || v === "" || v === "null") ? null : +v;
}

function moveTooltip(event) {
  tooltip
    .style("left", (event.pageX + 15) + "px")
    .style("top", (event.pageY - 10) + "px")
    .style("display", "block")
    .style("pointer-events", "none");
}

function hideTooltip() {
  tooltip.style("opacity", 0);
}

function processPreferredAndAppreciated(header, dataRows) {
const seen = new Set();

  let results = Q5_ORDER.map(id => ({
    id,
    label: SHORT_LABELS[id] || id,
    mass: 0,
    correlations: []
  }));

  dataRows.forEach(row => {
    const uid = `${row.GUID}-${row.LOI}`;
    if (seen.has(uid)) return;
    seen.add(uid);

    Q5_ORDER.forEach((q5Id, idx) => {
      // Check if respondent choose the media
      if (["1", "2", "3"].includes(String(row[q5Id]))) {
        results[idx].mass++;

        // 2. Proses Q1x2 (Perceived/Appreciated)
        Q1X2_COLS.forEach(q1Id => {
          // Find if Q1x2 media is in correlation with Q5
          let corrObj = results[idx].correlations.find(c => c.q1Id === q1Id);

          if (!corrObj) {
            corrObj = { q1Id, low: 0, medium: 0, high: 0, total: 0 };
            results[idx].correlations.push(corrObj);
          }

          const v = +row[q1Id];
          if (v >= 1 && v <= 2) corrObj.low++;
          else if (v >= 3 && v <= 4) corrObj.medium++;
          else if (v >= 5 && v <= 6) corrObj.high++;

          corrObj.total = corrObj.low + corrObj.medium + corrObj.high;
        });
      }
    });
  });

  // removing all 0 data of each media so it will not shown in the bar charts
  results.forEach(res => {
    res.correlations = res.correlations.filter(c => c.total > 0);
  });

  return results;
}

export function buildParallelTopRight(header, dataRows) {
  const container = document.getElementById("chart-radialSets");
  if (!container || !dataRows.length) return;
  d3.select(container).selectAll("svg").remove();

  const vW = 1000;
  const vH = 600;
  const dims = { width: vW, height: vH, margin: { top: 40, bottom: 40 } };

  drawAppreciationFilter();
  const processedData = processPreferredAndAppreciated(header, dataRows);

  if (globalMaxCorr === null) {
      globalMaxCorr = d3.max(processedData, d => d3.max(d.correlations, c => c.total)) || 1;
  }

  const activeParentId = getActiveParentId();

  const svg = d3.select(container).append("svg")
    .attr("viewBox", `0 0 ${vW} ${vH}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "auto")
    .style("overflow", "visible")
    .style("pointer-events", "none")
    .on("click", (e) => { if(e.target.tagName === "svg") DM.clearFilterSource(RADIAL_SOURCE); });

  // Q5 Scale
  const hScaleQ5 = d3.scaleLinear()
    .domain([0, d3.max(processedData, d => d.mass) || 1])
    .range([0, (vH / 2) - 80]);

  const boxMap = new Map(processedData.map(d => [d.id, { h: hScaleQ5(d.mass) }]));

  // call chart
  drawBarCharts(svg, processedData, boxMap, header, DM.baseRows.length, activeParentId, dims);
}

// main draw function
function drawBarCharts(svg, data, boxMap, header, totalN, activeParentId, dims) {
  const anchorY = dims.height / 2;
  const gap = 25;

  // Q1x2 scale
  const ySub = d3.scaleLinear()
    .domain([0, globalMaxCorr])
    .range([0, (dims.height / 2) - 80]);

  let totalUnits = 0;
  data.forEach(d => totalUnits += (activeParentId ? (d.id === activeParentId ? 1.8 : 0.7) : 1));
  const unitW = dims.width / totalUnits;

  let currentX = 0;

  const bars = svg.selectAll(".bar-group").data(data).join("g")
    .attr("class", "bar-group")
    .style("pointer-events", "all")
    .style("transition", "all 0.5s ease");

  bars.each(function(d) {
    const g = d3.select(this);
    const isThisActive = !activeParentId || d.id === activeParentId;
    const barW = activeParentId ? (d.id === activeParentId ? unitW * 1.8 : unitW * 0.7) : unitW;
    const xPos = currentX;
    currentX += barW;

    // 1. Label (Center Anchor)
    g.append("text")
      .attr("x", xPos + barW/2).attr("y", anchorY)
      .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .style("font-size", activeParentId === d.id ? "24px" : "15px")
      .style("opacity", isThisActive ? 1 : 0.2)
      .text(d.label.toLowerCase());

    // 2. Q1x2 (Growing upward)
    d.correlations.forEach((corr, i) => {
      const stepW = barW / d.correlations.length;
      let currY = anchorY - gap;

      ["low", "medium", "high"].forEach(lvl => {
        const isVis = activeAppreciationLevels.length === 0 ||
                      activeAppreciationLevels.includes(lvl.charAt(0).toUpperCase() + lvl.slice(1));
        let rawH = isVis ? ySub(corr[lvl]) : 0;
        let h = rawH;
        if (rawH > 0 && rawH < 10) {
            h = rawH * 10;
        } else if (rawH <= 0) {
            h = 0;
        }
        const sel = isSelectedStackSegment({parentId: d.id, q1Id: corr.q1Id}, lvl);

        g.append("rect")
          .attr("x", xPos + (i * stepW)).attr("y", currY - h)
          .attr("width", Math.max(stepW - 0.5, 0.1)).attr("height", h)
          .attr("fill", d3.color(getColorById(corr.q1Id)).darker(lvl==="high"?0 : lvl==="medium"?0.7:1.5))
          .attr("stroke", sel ? "black" : "none")
          .style("opacity", isThisActive ? 1 : 0.1)
          .style("cursor", "pointer")
          .on("mouseover", (event) => {
            handleToolTipDetail(event, {
              ...corr,
              count: corr[lvl],
              levelLabel: lvl.toUpperCase(),
              type: "Sub-Correlation",
              parentMass: d.mass,
              parentId: d.id
            }, totalN, header, "Correlation");
            d3.select(event.currentTarget).style("filter", "brightness(1.2)");
          })
          .on("mousemove", moveTooltip)
          .on("mouseout", (event) => {
            hideTooltip();
            d3.select(event.currentTarget).style("filter", "none");
            svg.selectAll(".bar-group")
                 .style("opacity", g_data => (!activeParentId || g_data.id === activeParentId) ? 1 : 0.1);
          })
          .on("click", (e) => {
            e.stopPropagation();
            toggleStackFilter({parentId: d.id, q1Id: corr.q1Id}, lvl);
          });

        currY -= h;
      });
    });

    // 3. Q5 (Growing to bottom)
    const hQ5 = boxMap.get(d.id)?.h || 0;
    g.append("rect")
      .attr("x", xPos).attr("y", anchorY + gap)
      .attr("width", barW - 1).attr("height", hQ5)
      .attr("fill", getColorById(d.id))
      .style("opacity", isThisActive ? 1 : 0.1)
      .style("cursor", "pointer")
      .on("mouseover", (e) => {
          handleToolTipDetail(e, d, totalN, header, "Preferred Media");
          d3.select(e.currentTarget).style("filter", "brightness(1.1)");
        })
        .on("mousemove", moveTooltip)
        .on("mouseout", (e) => {
          hideTooltip();
          d3.select(e.currentTarget).style("filter", "none");
        })
        .on("click", (e) => {
          e.stopPropagation();
          toggleParentFilter(d.id);
        });
  });
}

// Update Q1x2 when filter clicked
function updateQ1x2(w) {
    d3.selectAll(".bar-group").transition().duration(500);
}

function drawAppreciationFilter() {
  let container = d3.select("#filter-appreciation");
  if (container.empty()) {
    container = d3.select("#chart-radialSets").insert("div", ":first-child")
      .attr("id", "filter-appreciation").style("display","flex").style("justify-content","center").style("gap","20px").style("margin-bottom","10px");
  }
  container.selectAll("*").remove();

  APPRECIATION_CONFIG.forEach(cfg => {
    const active = activeAppreciationLevels.includes(cfg.key);
    container.append("label").style("cursor","pointer").style("font-family","sans-serif").style("font-size","12px").html(`
      <input type="checkbox" ${active ? "checked" : ""}> <span>${cfg.label}</span>
    `).on("click", (e) => {
      e.preventDefault();
      if (active) activeAppreciationLevels = activeAppreciationLevels.filter(l => l !== cfg.key);
      else activeAppreciationLevels.push(cfg.key);
      buildParallelTopRight(DM.headerRow, DM.currentRows);
    });
  });
}

function handleToolTipDetail(event, d, totalN, header, type) {
  const rawLabel = header ? (header[d.target || d.id || d.q1Id] || "") : "";
  const cleanLabel = cleanLongLabel(rawLabel);

  let value = 0;
  let pct = 0;
  let subText = "";
  const categoryColor = getColorById(d.q1Id || d.id);

  if (type === "Correlation" || d.type === "Sub-Correlation") {
    value = d.count;
    pct = d.parentMass > 0 ? ((d.count / d.parentMass) * 100).toFixed(1) : 0;
    const parentName = SHORT_LABELS[d.parentId] || d.parentId;
    subText = `Group: <b style="color: white;">${parentName.toLowerCase()}</b><br>
               Level: <b style="color: ${categoryColor};">${d.levelLabel} Appreciation</b>`;
  } else {
    value = d.mass || 0;
    pct = totalN > 0 ? ((value / totalN) * 100).toFixed(1) : 0;
    subText = `Type: <b>${type}</b>`;
  }

  const html = `
    <div style="width: 260px; min-height: 100px; font-family: sans-serif; font-size: 12px; color: white; padding: 5px;">
      <b style="display:block; border-bottom:2px solid ${categoryColor}; margin-bottom:8px; padding-bottom:3px; text-transform: uppercase;">
        ${type} Detail
      </b>
      <div style="margin-bottom:10px;">
        ${subText}<br>
        <i style="color: #bbb; display: block; margin-top: 4px;">"${cleanLabel}"</i>
      </div>
      <div style="padding: 8px; border-radius: 4px; display: flex; justify-content: space-between; background: rgba(255, 255, 255, 0.15);">
        <span>Count: <b>${value}</b></span>
        <span><b>${pct}%</b></span>
      </div>
    </div>`;

  tooltip
    .style("opacity", 1)
    .style("display", "block")
    .style("pointer-events", "none")
    .style("background", "rgba(30, 30, 30, 0.95)")
    .style("border", "1px solid #444")
    .style("border-radius", "8px")
    .html(html);

  moveTooltip(event);
}

const redraw = () => { if(DM.headerRow && DM.currentRows) buildParallelTopRight(DM.headerRow, DM.currentRows); };
window.addEventListener("data_changed", redraw);
window.addEventListener("resize", redraw);
redraw();