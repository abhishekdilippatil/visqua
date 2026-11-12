import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { DM } from "./DataManager.js";

/*
===============================================================================
UpSet Chart (Q1 – Received Information)
-------------------------------------------------------------------------------
Shows intersections of Q1 Yes responses and reacts to the shared filter state.

Notes:
- Q1_13_FA is a free-text "Other" column.
- It is treated as selected when text exists.

===============================================================================
*/

// ============================================================================
// CONFIG
// ============================================================================
const OTHER_FREE_TEXT_COLUMN = "Q1_13_FA";

const Q1_COLUMNS = [
  "Q1_1", "Q1_2", "Q1_3", "Q1_4", "Q1_5",
  "Q1_6", "Q1_7", "Q1_8", "Q1_9",
  "Q1_10", "Q1_11", "Q1_12",
  OTHER_FREE_TEXT_COLUMN
];

const Q1_SHORT_LABELS = {
  Q1_1: "digile",
  Q1_2: "phyle",
  Q1_3: "email",
  Q1_4: "selfd",
  Q1_5: "dbook",
  Q1_7: "games",
  Q1_8: "simul",
  Q1_9: "dtips",
  Q1_10: "broch",
  Q1_11: "ptips",
  Q1_12: "pcast",
  [OTHER_FREE_TEXT_COLUMN]: "other"
};

const tooltip = d3.select("#tooltip");

// ============================================================================
// HELPERS
// ============================================================================
function isYes(value) {
  return String(value || "").trim().toLowerCase() === "yes";
}

function hasFreeText(value) {
  const cleanedValue = String(value ?? "").trim();
  const lowerValue = cleanedValue.toLowerCase();
  if (!cleanedValue) return false;
  if (lowerValue === "null" || lowerValue === "na") return false;
  return true;
}

function isSelectedSet(row, columnName) {
  if (columnName === OTHER_FREE_TEXT_COLUMN) return hasFreeText(row[columnName]);
  return isYes(row[columnName]);
}

// Q5_1 and Q5_2 map to swapped Q1 columns in the survey.
function mapQ5ToQ1(q5Column) {
  if (q5Column === "Q5_1") return "Q1_2";
  if (q5Column === "Q5_2") return "Q1_1";
  return q5Column.replace("Q5_", "Q1_");
}

// Create the bottom pan slider once and reuse it.
function ensureBottomPanSlider(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return null;

  let wrapper = container.closest(".pan-wrap");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "pan-wrap";
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.height = "100%";
    wrapper.style.width = "100%";
    wrapper.style.flex = "1";
    wrapper.style.minHeight = "0";

    const parent = container.parentElement;
    parent.insertBefore(wrapper, container);
    wrapper.appendChild(container);
  }

  container.style.flex = "1";
  container.style.minHeight = "0";

  let slider = wrapper.querySelector("#panX");
  if (!slider) {
    slider = document.createElement("input");
    slider.id = "panX";
    slider.type = "range";
    slider.min = "0";
    slider.max = "1000";
    slider.value = "0";
    slider.step = "1";
    slider.style.width = "100%";
    slider.style.marginTop = "6px";
    slider.style.height = "10px";
    slider.style.display = "none";
    wrapper.appendChild(slider);
  }

  return slider;
}

function createSvg(parentSelector, margin) {
  const parent = d3.select(parentSelector);
  parent.selectAll("svg").remove();

  const node = parent.node();
  const width = node?.clientWidth || 650;
  const height = node?.clientHeight || 420;

  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);

  const root = parent.append("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("preserveAspectRatio", "none");

  return { root, innerWidth, innerHeight, width, height };
}

function buildQ1Intersections(rows, activeColumns) {
  // signature -> { sig, yesCols, count }
  const intersectionMap = new Map();

  for (const row of rows) {
    // These columns define the true filter signature.
    // The free-text "other" column is excluded so it does not make every
    // clicked intersection behave like "other" is always required.
    const signatureColumns = activeColumns.filter(columnName => {
      if (columnName === OTHER_FREE_TEXT_COLUMN) return false;
      return isSelectedSet(row, columnName);
    });

    // These columns are used for display.
    // The free-text "other" column is added back visually when text exists.
    const displayColumns = [...signatureColumns];
    if (activeColumns.includes(OTHER_FREE_TEXT_COLUMN) && hasFreeText(row[OTHER_FREE_TEXT_COLUMN])) {
      displayColumns.push(OTHER_FREE_TEXT_COLUMN);
    }

    if (displayColumns.length === 0) continue;

    const signature = signatureColumns.join("|");
    const currentIntersection = intersectionMap.get(signature);

    if (currentIntersection) {
      currentIntersection.count += 1;
    } else {
      intersectionMap.set(signature, {
        sig: signature,
        yesCols: displayColumns,
        count: 1
      });
    }
  }

  return Array.from(intersectionMap.values()).sort((a, b) => b.count - a.count);
}

function getLabelText(labelRow, columnName) {
  const rawLabel = labelRow?.[columnName];
  if (!rawLabel) return columnName;
  return rawLabel.split("[" || ",")[0].trim() || columnName;
}

// ============================================================================
// RENDER
// ============================================================================
function renderQ1UpSet(dataRows, topN) {
  if (!dataRows || !dataRows.length) {
    d3.select("#Upset-plot").selectAll("*").remove();
    d3.select("#Upset-plot")
      .append("div")
      .style("color", "#6b7280")
      .style("font-size", "12px")
      .text("No rows to display.");
    return;
  }

  const availableColumns = Object.keys(dataRows[0] || {});
  let usedColumns = Q1_COLUMNS.filter(columnName => availableColumns.includes(columnName));

  // If the radial chart has an active Q5 filter, show only intersections that
  // contain the mapped Q1 column.
  const radialFilter = DM.getFilterBySource ? DM.getFilterBySource("radial") : null;
  let activeQ1Column = null;

  if (radialFilter && radialFilter.kind === "q5_ranked" && radialFilter.col) {
    activeQ1Column = mapQ5ToQ1(radialFilter.col);
  }

  if (activeQ1Column && !usedColumns.includes(activeQ1Column)) {
    activeQ1Column = null;
  }

  // Order rows by how often they appear overall.
  const setCounts = new Map(usedColumns.map(columnName => [columnName, 0]));
  for (const row of dataRows) {
    for (const columnName of usedColumns) {
      if (isSelectedSet(row, columnName)) {
        setCounts.set(columnName, setCounts.get(columnName) + 1);
      }
    }
  }

  usedColumns = usedColumns.slice().sort((a, b) => setCounts.get(b) - setCounts.get(a));

  const allIntersectionsRaw = buildQ1Intersections(dataRows, usedColumns);
  const allIntersections = activeQ1Column
    ? allIntersectionsRaw.filter(intersection => intersection.yesCols.includes(activeQ1Column))
    : allIntersectionsRaw;

  const shownIntersectionsRaw = topN === "all"
    ? allIntersections
    : allIntersections.slice(0, +topN);

  const shownIntersections = shownIntersectionsRaw.map(intersection => ({
    ...intersection,
    flags: usedColumns.map(columnName => intersection.yesCols.includes(columnName))
  }));

  const totalYesOnly = d3.sum(allIntersections, intersection => intersection.count);
  const shownCount = d3.sum(shownIntersections, intersection => intersection.count);
  const coverage = totalYesOnly ? (shownCount / totalYesOnly) : 0;

  const margin = { top: 34, right: 10, bottom: 10, left: 50 };
  const slider = ensureBottomPanSlider("#Upset-plot");

  if (slider) {
    slider.style.display = "none";
    slider.oninput = null;
    slider.value = "0";
  }

  const { root, innerWidth, innerHeight } = createSvg("#Upset-plot", margin);

  // Double-click resets the full dashboard state.
  root.on("dblclick", () => DM.reset("upset"));

  const fixedLayer = root.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const clipId = "clip-upset-q1";
  root.selectAll("defs").remove();
  root.append("defs")
    .append("clipPath")
    .attr("id", clipId)
    .append("rect")
    .attr("x", margin.left)
    .attr("y", margin.top)
    .attr("width", innerWidth)
    .attr("height", innerHeight);

  const contentLayer = root.append("g").attr("clip-path", `url(#${clipId})`);
  const panLayer = contentLayer.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  if (!shownIntersections.length) {
    fixedLayer.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#6b7280")
      .text("No Yes-combinations found.");
    return;
  }

  const topBarHeight = Math.min(120, Math.max(70, innerHeight * 0.30));
  const matrixTop = topBarHeight + 10;
  const matrixHeight = innerHeight - matrixTop;

  const minColumnWidth = topN === "all" ? 10 : 18;
  const contentWidth = Math.max(innerWidth, shownIntersections.length * minColumnWidth);

  const xScale = d3.scaleBand()
    .domain(d3.range(shownIntersections.length))
    .range([0, contentWidth])
    .paddingInner(topN === "all" ? 0.08 : 0.18)
    .paddingOuter(0.06);

  const yTopScale = d3.scaleLinear()
    .domain([0, d3.max(shownIntersections, d => d.count) || 1])
    .range([topBarHeight, 0]);

  const yRowScale = d3.scaleBand()
    .domain(d3.range(usedColumns.length))
    .range([matrixTop, matrixTop + matrixHeight])
    .padding(0.25);

  fixedLayer.append("text")
    .attr("x", 0)
    .attr("y", -12)
    .attr("font-size", 12)
    .attr("fill", "#6b7280")
    .text(
      topN === "all"
        ? `All Yes-only combinations (${allIntersections.length}) — use slider to pan`
        : `Top ${topN} combinations (covers ${(coverage * 100).toFixed(1)}% of Yes-only respondents)`
    );

  fixedLayer.append("g")
    .selectAll("text")
    .data(usedColumns)
    .join("text")
    .attr("x", -10)
    .attr("y", (_, rowIndex) => yRowScale(rowIndex) + yRowScale.bandwidth() / 2 + 4)
    .attr("text-anchor", "end")
    .attr("font-size", 11)
    .attr("fill", "#374151")
    .text(columnName => Q1_SHORT_LABELS[columnName] ?? columnName);

  panLayer.append("g")
    .selectAll("rect")
    .data(shownIntersections)
    .join("rect")
    .attr("class", "top-bar")
    .attr("x", (_, index) => xScale(index))
    .attr("width", Math.max(0.5, xScale.bandwidth()))
    .attr("height", item => topBarHeight - yTopScale(item.count))
    .attr("y", item => yTopScale(item.count) - 6);

  const lineOpacity = (topN === "all" || +topN >= 80) ? 0.12 : 0.35;

  panLayer.append("g")
    .selectAll("line")
    .data(
      shownIntersections.map((item, index) => {
        const selectedRows = item.flags.map((flag, rowIndex) => (flag ? rowIndex : null)).filter(v => v !== null);
        if (selectedRows.length <= 1) return null;
        return { index, rowStart: d3.min(selectedRows), rowEnd: d3.max(selectedRows) };
      }).filter(Boolean)
    )
    .join("line")
    .attr("class", "row-line")
    .attr("stroke", "#000000")
    .attr("stroke-width", 1)
    .attr("stroke-opacity", lineOpacity)
    .attr("x1", item => xScale(item.index) + xScale.bandwidth() / 2)
    .attr("x2", item => xScale(item.index) + xScale.bandwidth() / 2)
    .attr("y1", item => yRowScale(item.rowStart) + yRowScale.bandwidth() / 2)
    .attr("y2", item => yRowScale(item.rowEnd) + yRowScale.bandwidth() / 2);

  const dotRadius = (topN === "all")
    ? Math.max(1.0, Math.min(3.0, xScale.bandwidth() * 0.22, yRowScale.bandwidth() * 0.30))
    : Math.max(1.4, Math.min(5.0, xScale.bandwidth() * 0.28, yRowScale.bandwidth() * 0.35));

  const dotData = [];
  shownIntersections.forEach((intersection, columnIndex) => {
    intersection.flags.forEach((flag, rowIndex) => {
      if (flag) dotData.push({ columnIndex, rowIndex });
    });
  });

  panLayer.append("g")
    .selectAll("circle")
    .data(dotData)
    .join("circle")
    .attr("cx", item => xScale(item.columnIndex) + xScale.bandwidth() / 2)
    .attr("cy", item => yRowScale(item.rowIndex) + yRowScale.bandwidth() / 2)
    .attr("r", dotRadius)
    .attr("fill", "#111827");

  panLayer.append("g")
    .selectAll("rect.hit")
    .data(shownIntersections)
    .join("rect")
    .attr("x", (_, index) => xScale(index))
    .attr("y", 0)
    .attr("width", Math.max(0.5, xScale.bandwidth()))
    .attr("height", innerHeight)
    .attr("fill", "transparent")
    .on("mouseover", (event, item) => {
      tooltip
        .style("opacity", 1)
        .html(
          `<strong>Combination</strong><br/>
           ${item.yesCols.map(columnName => getLabelText(DM.headerRow, columnName)).join(", ")}<br/>
           Count: ${item.count}`
        )
        .style("left", event.pageX + "px")
        .style("top", event.pageY + "px")
        .style("transform", "translate(0, -100%)");
    })
    .on("mousemove", event => {
      tooltip
        .style("left", event.pageX + "px")
        .style("top", event.pageY + "px")
        .style("transform", "translate(0, -100%)");
    })
    .on("mouseout", () => tooltip.style("opacity", 0))
    .on("click", (event, item) => {
      DM.setFilter(
        {
          kind: "q1_intersection",
          sig: item.sig,
          usedQ1Cols: usedColumns.filter(columnName => columnName !== OTHER_FREE_TEXT_COLUMN)
        },
        "upset"
      );
    });

  const maxPan = Math.max(0, contentWidth - innerWidth);

  if (slider && maxPan > 0) {
    slider.style.display = "block";

    const applyPan = translateX => {
      panLayer.attr("transform", `translate(${margin.left - translateX},${margin.top})`);
    };

    slider.oninput = () => {
      const translateX = (+slider.value / 1000) * maxPan;
      applyPan(translateX);
    };

    applyPan(0);
  }
}

// ============================================================================
// WIRING
// ============================================================================
d3.selectAll('input[name="topN"]').on("change", function () {
  DM.setTopN(this.value);
});

window.addEventListener("data_changed", () => {
  renderQ1UpSet(DM.currentRows, DM.topN || "20");
});

window.addEventListener("resize", () => {
  renderQ1UpSet(DM.currentRows, DM.topN || "20");
});
