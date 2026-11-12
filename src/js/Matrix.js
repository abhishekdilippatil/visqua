import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { DM } from "./DataManager.js";

const tooltip = d3.select("#tooltip");

// Column identification patterns
const COLUMN_PATTERNS = {
  Q1: /^Q1_(1[0-3]|[1-9])$/,
  Q2: /^Q2_\d+$/,
  Q5: /^Q5_(1[0-2]|[1-9])$/
};

// Short labels for Q1 and Q5
const SHORT_LABELS = {
  Q1_1: "digle",
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
  Q1_13: "other",
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

// Global state
let globalHeader = null;
let globalRows = [];
let labelRows = [];
let Q1_COLS = [];
let Q2_COLS = [];
let Q5_COLS = [];
let selection = null;
let radialQ5Highlight = null;
// Helper functions
function labelText(headerRow, colName) {
  const raw = headerRow[colName];
  if (!raw) return colName;
  return raw.split("[")[0].trim() || colName;
}

function isReceived(v) {
  if (!v) return false;
  return String(v).trim().toLowerCase() === "yes";
}

function rankValue(v) {
  if (!v) return null;
  const n = +v;
  return n >= 1 && n <= 3 ? n : null;
}

// Identify columns matching a pattern
function identifyColumns(headers, pattern) {
  return headers.filter(h => pattern.test(h));
}

// Process raw CSV data into structured format
function processCSVDataFromDM() {
  if (!DM.columns?.length || !DM.headerRow || !DM.baseRows) {
    throw new Error("DM is not ready (missing columns/headerRow/baseRows)");
  }

  const headers = DM.columns;

  const columns = {
    Q1: identifyColumns(headers, COLUMN_PATTERNS.Q1),
    Q2: identifyColumns(headers, COLUMN_PATTERNS.Q2),
    Q5: identifyColumns(headers, COLUMN_PATTERNS.Q5)
  };

  // Validate that we have required columns
  if (!columns.Q1.length || !columns.Q2.length || !columns.Q5.length) {
    throw new Error("Missing required question columns (Q1, Q2, or Q5)");
  }

  return {
    headers,
    labelRow: DM.headerRow,
    dataRows: DM.currentRows || [],
    columns
  };
}

// Initialize or reinitialize the visualization
function initializeVisualization(labelRow, dataRows) {
  d3.select("#chart-matrix").selectAll("svg").remove();
  buildMatrix(labelRow, dataRows);
}

// ---------------------------------------------------------------------------
// DM wiring: redraw on data change + resize (DM loads CSV elsewhere)
// ---------------------------------------------------------------------------

function syncSelectionFromDM() {
  // Read selection from DM.filter 
  const f = DM.filter || { kind: "reset" };
  if (f.kind === "matrix_cell") {
    selection = { q1: f.q1, q5: f.q5, rank: f.rank };
  } else {
    selection = null;
  }
  const radialFilter = DM.getFilterBySource ? DM.getFilterBySource("radial") : null;

  if (!radialFilter) {
    radialQ5Highlight = null;
  } else if (radialFilter.kind === "q5_ranked") {
    radialQ5Highlight = radialFilter.col;
  } else if (radialFilter.kind === "q1x2_rated") {
    radialQ5Highlight = radialFilter.q5Col;
  }
}

function redrawFromDM() {
  try {
    // DM might broadcast before init finishes; guard it
    if (!DM.columns?.length || !DM.headerRow || !DM.currentRows) return;

    syncSelectionFromDM();

    const processedData = processCSVDataFromDM();

    // Store in global state
    globalHeader = processedData.headers;
    labelRows = processedData.labelRow;
    globalRows = DM.baseRows || [];
    Q1_COLS = processedData.columns.Q1;
    Q2_COLS = processedData.columns.Q2;
    Q5_COLS = processedData.columns.Q5;

    // Initial visualization
    initializeVisualization(labelRows, processedData.dataRows);
  } catch (error) {
    console.error("Error processing data:", error.message);
  }
}

window.addEventListener("data_changed", redrawFromDM);
window.addEventListener("resize", redrawFromDM);

// first draw if DM is already ready when this module loads
redrawFromDM();

// Matrix plot
function buildMatrix(header, dataRows) {
  if (!dataRows.length) return;

  // Prepare data structures
  const colsX = Q1_COLS.map(col => ({ col, label: labelText(header, col), shortLabel: SHORT_LABELS[col] }));
  let rowsY = Q5_COLS.map(col => ({ col, label: labelText(header, col), shortLabel: SHORT_LABELS[col] }));

  // Swap first two rows to create diagonal alignment (Q5_2 digle aligns with Q1_1 digle, etc.)
  if (rowsY.length >= 2) {
    [rowsY[0], rowsY[1]] = [rowsY[1], rowsY[0]];
  }

  // Data aggregation
  const cellCount = new Map();  // "Q1||Q5" -> {1:count,2:count,3:count}
  const q1Counts = new Map();   // Q1 -> count of Q1 responses for top bars

  // Helper to get or create cell count object
  function getCell(key){
    if(!cellCount.has(key)) cellCount.set(key, {1:0,2:0,3:0});
    return cellCount.get(key);
  }

  // Helper to check if a cell matches the current selection
  function isSelected(q1, q5, rank) {
    return selection &&
           selection.q1 === q1 &&
           selection.q5 === q5 &&
           selection.rank === rank;
  }

  // Helper to position and show tooltip
  function showTooltip(html, event) {
    tooltip
      .style("opacity", 1)
      .html(html)
      .style("left", event.pageX + "px")
      .style("top", event.pageY + "px")
      .style("transform", "translate(0, -100%)");
  }

  // Helper to move tooltip with mouse
  function moveTooltip(event) {
    tooltip
      .style("left", event.pageX + "px")
      .style("top", event.pageY + "px")
      .style("transform", "translate(0, -100%)");
  }

  // Helper to hide tooltip
  function hideTooltip() {
    tooltip.style("opacity", 0);
  }

  // Initialize maps
  Q1_COLS.forEach(c => {
    q1Counts.set(c, 0);
  });

  const totalResp = dataRows.length;

  // Q2 processing
  const q2Sum = new Map(Q1_COLS.map(q1 => [q1, new Map(Q2_COLS.map(q2 => [q2, 0]))]));
  const q2N   = new Map(Q1_COLS.map(q1 => [q1, new Map(Q2_COLS.map(q2 => [q2, 0]))]));

  // Q2: convert to score 1..6 or null
  function q2ToScore(v){
    const n = +v;
    return Number.isFinite(n) ? Math.max(1, Math.min(6, n)) : null;
  }

  // Map Q2 means to face features
  function faceFromQ2Means(meanMap){
    const round16 = x => (x == null ? null : Math.max(1, Math.min(6, Math.round(x))));

    return {
      // Map each Q2 item to one feature (adjust mapping if you want different)
      faceTone:  round16(meanMap.get("Q2_1")),
      eyeSize:   round16(meanMap.get("Q2_2")),
      mouthShape:round16(meanMap.get("Q2_3")),
      browShape: round16(meanMap.get("Q2_4")),
      underEye:  round16(meanMap.get("Q2_5")),
      chin:      round16(meanMap.get("Q2_6")),
      pimples:   round16(meanMap.get("Q2_7")),
    };
  }

  // Aggregate data
  dataRows.forEach(row => {
    const received = Q1_COLS.filter(c => isReceived(row[c]));
    // Count Q1 responses for top bars
    received.forEach(q1 => {
      q1Counts.set(q1, q1Counts.get(q1) + 1);
    });

    // For each received (Q1), accumulate Q2 sums and counts
    received.forEach(q1 => {
      const sumMap = q2Sum.get(q1);
      const nMap   = q2N.get(q1);

      for (const q2 of Q2_COLS){
        const v = q2ToScore(row[q2]);
        if (v != null){
          sumMap.set(q2, sumMap.get(q2) + v);
          nMap.set(q2, nMap.get(q2) + 1);
        }
      }
    });

    // For each received (Q1) and preferred (Q5) pair, count by rank
    const preferred = Q5_COLS.filter(c => rankValue(row[c]) !== null);
    received.forEach(q1 => {
      preferred.forEach(q5 => {
        const r = rankValue(row[q5]);        // 1..3
        const key = `${q1}||${q5}`;
        getCell(key)[r] += 1;
      });
    });
  });

  // Compute Q2 means per Q1
  const q2Mean = new Map(
    Q1_COLS.map(q1 => {
      const sumMap = q2Sum.get(q1);
      const nMap   = q2N.get(q1);
      const meanMap = new Map(Q2_COLS.map (q2 => {
        const n =nMap.get(q2);
        return [q2, n ? (sumMap.get(q2) / n) : null];
      }));
      return [q1, meanMap];
    })
  );

  // Determine max counts per rank for color scaling
  const maxByRank = {1:0,2:0,3:0};

  // Scan all cells
  rowsY.forEach(r => {
    colsX.forEach(c => {
      const key = `${c.col}||${r.col}`;
      const obj = cellCount.get(key);
      if (!obj) return;
      maxByRank[1] = Math.max(maxByRank[1], obj[1] || 0);
      maxByRank[2] = Math.max(maxByRank[2], obj[2] || 0);
      maxByRank[3] = Math.max(maxByRank[3], obj[3] || 0);
    });
  });

  // Overall max
  const globalMax = Math.max(maxByRank[1]||0, maxByRank[2]||0, maxByRank[3]||0) || 1;

  // Color scale for all ranks
  const rankColorScale = d3.scaleSequential(d3.interpolateReds).domain([0, globalMax]);

  // Max total for top bars
  const maxColTotal = d3.max(Q1_COLS.map(c => q1Counts.get(c) || 0)) || 1;

  // Set up SVG and scales
  const host = document.querySelector("#chart-matrix");
  const width = host.clientWidth || host.getBoundingClientRect().width;
  const height = host.clientHeight || host.getBoundingClientRect().height;
  const w = width;
  const h = height;

  // Layout areas (relative to height)
  const barAreaHeight = h * 0.1;
  const emojiAreaHeight = h * 0.06;
  const matrixHeight = h - barAreaHeight - emojiAreaHeight;

  // Create SVG with larger viewBox to accommodate all labels
  const svgViewBoxWidth = width;
  const svgViewBoxHeight = height*1.2;
  const svgRoot = d3.select("#chart-matrix")
    .append("svg")
    .attr("viewBox", `0 0 ${svgViewBoxWidth} ${svgViewBoxHeight}`)
    .attr("preserveAspectRatio", "None");

  svgRoot.on("click", () => {
    // clear selection via DM
    if (!selection) return;
    DM.reset("matrix");
  });

  // Main group
  const svg = svgRoot.append("g");

  // Scales
  const x = d3.scaleBand()
    .domain(colsX.map(d => d.col))
    .range([0, w])
    .padding(0.1);

  const y = d3.scaleBand()
    .domain(rowsY.map(d => d.col))
    .range([barAreaHeight, barAreaHeight + matrixHeight])
    .padding(0.1);

  const barScale = d3.scaleLinear()
    .domain([0, maxColTotal])
    .range([barAreaHeight, 0]);

  // Top bars
  const gBars = svg.append("g");

  gBars.selectAll("rect")
    .data(colsX)
    .join("rect")
    .attr("class", "top-bar")
    .attr("fill", "#999")
    .attr("x", d => x(d.col))
    .attr("width", x.bandwidth())
    .attr("y", d => barScale(q1Counts.get(d.col) || 0))
    .attr("height", d => barAreaHeight - barScale(q1Counts.get(d.col) || 0))
    .attr("rx", width * 0.004)
    .on("mouseover", (event, d) => {
      const count = q1Counts.get(d.col) || 0;
      showTooltip(
        `<strong>${d.label}</strong><br/>
         <strong>Count:</strong> ${count}<br/>`,
        event
      );
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", hideTooltip);

  gBars.selectAll(".top-bar-label")
    .data(colsX)
    .join("text")
    .attr("class", "top-bar-label")
    .attr("x", d => x(d.col) + x.bandwidth() / 2)
    .attr("y", barAreaHeight*0.97)
    .attr("font-size", `${width * 0.02}px`)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "auto")
    .attr("fill", "black")
    .text(d => q1Counts.get(d.col) || "");

  // matrix cells
  const gMatrix = svg.append("g");

  const rowGroups = gMatrix.selectAll(".row")
    .data(rowsY)
    .join("g")
    .attr("class", "row")
    .attr("transform", r => `translate(0,${y(r.col)})`)
    .style("opacity", r => {
      // no radial filter → normal
      if (!radialQ5Highlight) return 1;

      // highlight only the matching Q5 row
      return r.col === radialQ5Highlight ? 1 : 0.15;
    });
  const ranks = [1,2,3];
  const partW = x.bandwidth() / 3;

  // Cells with 3 stacked parts
  rowGroups.selectAll("g.cell")
    .data(r => colsX.map(c => ({ xCol: c, yRow: r, key: `${c.col}||${r.col}` })))
    .join("g")
    .attr("class", "cell")
    .attr("transform", d => `translate(${x(d.xCol.col)},0)`)
    .each(function(d) {
      const g = d3.select(this);
      const c = cellCount.get(d.key) || {1:0,2:0,3:0};
      const total = c[1]+c[2]+c[3];

      // 3 stacked parts
      g.selectAll("rect.part")
        .data(ranks.map(rk => ({
          r: rk,
          v: c[rk],
          total,
          q1: d.xCol.col,
          q5: d.yRow.col,
          q1Label: d.xCol.label,
          q5Label: d.yRow.label
        })))
        .join("rect")
        .attr("class", "part")
        .attr("x", p => (p.r - 1) * partW)
        .attr("y", 0)
        .attr("width", partW)
        .attr("height", y.bandwidth())
        .attr("fill", p => p.v ? rankColorScale(p.v) : "transparent")
        .attr("stroke", p => isSelected(p.q1, p.q5, p.r) ? "#ff0" : "#000")
        .attr("stroke-width", p => isSelected(p.q1, p.q5, p.r) ? (width * 0.003) : (width * 0.00075))
        .attr("filter", p => isSelected(p.q1, p.q5, p.r) ? `drop-shadow(0 0 ${width * 0.003}px #000)` : "none")
        .style("pointer-events", "all")
        .style("cursor", "pointer")
        .on("click", (event, p) => {
          event.stopPropagation(); // prevents background clear
          if (!p.v) {
            showTooltip(`<strong>No responses</strong><br/>This slice has 0 entries.`, event);
            return;
          }
            const SRC = "matrix";
            const active = DM.getFilterBySource(SRC);

            const nextFilter = { kind: "matrix_cell", q1: p.q1, q5: p.q5, rank: p.r };

            const isSame =
              active?.kind === "matrix_cell" &&
              active?.q1 === nextFilter.q1 &&
              active?.q5 === nextFilter.q5 &&
              (active?.rank ?? null) === (nextFilter.rank ?? null);

            if (isSame) {
              // remove only matrix filter (keep trellis + others)
              DM.clearFilterSource(SRC);
            } else {
              // set/replace only matrix filter (stacked)
              DM.setFilter(nextFilter, SRC);
            }
        })
        .on("mouseover", (event, p) => {
          showTooltip(
            `<strong>Received:</strong> ${d.xCol.label}<br/>
            <strong>Preferred:</strong> ${d.yRow.label}<br/>
            <strong>Rank:</strong> ${p.r}<br/>
            <strong>Count:</strong> ${p.v}<br/>`,
            event
          );
        })
        .on("mousemove", moveTooltip)
        .on("mouseout", hideTooltip);
    });

  // Axes
  svg.append("g")
    .selectAll("line")
    .data(rowsY)
    .join("line")
    .attr("class", "row-line")
    .attr("x1", 0)
    .attr("x2", w)
    .attr("y1", r => y(r.col) + y.bandwidth())
    .attr("y2", r => y(r.col) + y.bandwidth());

  svg.append("g")
    .selectAll("line")
    .data(colsX)
    .join("line")
    .attr("class", "row-line")
    .attr("y1", barAreaHeight)
    .attr("y2", barAreaHeight + matrixHeight)
    .attr("x1", c => x(c.col) + x.bandwidth())
    .attr("x2", c => x(c.col) + x.bandwidth());

  // Column labels (X-axis - bottom)
  svg.append("g")
    .selectAll("text.col-label")
    .data(colsX)
    .join("text")
    .attr("class", "col-label")
    .attr("x", c => x(c.col) + x.bandwidth() / 2)
    .attr("y", barAreaHeight + matrixHeight + (width * 0.01))
    .attr("text-anchor", "middle")
    .attr("font-size", `${width * 0.02}px`)
    .attr("fill", "rgba(0,0,0,0.7)")
    .text(c => c.shortLabel);

  // Row labels (Y-axis - right side)
  svg.append("g")
    .selectAll("text.row-label")
    .data(rowsY)
    .join("text")
    .attr("class", "row-label")
    .attr("x", w )
    .attr("y", r => y(r.col) + y.bandwidth() / 2)
    .attr("text-anchor", "start")
    .attr("dominant-baseline", "middle")
    .attr("font-size", `${width * 0.02}px`)
    .attr("fill", "rgba(0,0,0,0.7)")
    .text(r => r.shortLabel);

  // Emoji faces below (positioned after column labels)
  const emojiY = barAreaHeight + matrixHeight + (width * 0.03);
  const gEmoji = svg.append("g");

  // Draw face function
  function drawFace(g, f, size) {
    g.selectAll("*").remove();

    const r = size / 2;

    // --- helpers ---
    const clamp16 = v => (v == null ? null : Math.max(1, Math.min(6, +v)));
    const t01 = v => (v == null ? null : (clamp16(v) - 1) / 5); // 0..1
    const has = v => v != null;

    // Expect 7 features, each 1..6 or null
    const faceToneT  = t01(f.faceTone);
    const eyeSizeT   = t01(f.eyeSize);
    const mouthT     = t01(f.mouthShape);
    const browT      = t01(f.browShape);
    const underEyeT  = t01(f.underEye);
    const chinT      = t01(f.chin);
    const pimplesT   = t01(f.pimples);

    // 1) Face color shade (happy = brighter, sad = duller)
    // If null, use a reasonable default.
    const tone = has(faceToneT) ? faceToneT : 0.6;
    // Interpolate between two yellows
    const faceFill = d3.interpolateRgb("#ff0000", "#ffee00")(tone);

    g.append("circle")
      .attr("cx", 0).attr("cy", 0).attr("r", r)
      .attr("fill", faceFill)
      .attr("stroke", "rgba(0,0,0,0.18)")
      .attr("stroke-width", 1);

    // shared anchor points
    const eyeY = -r * 0.18;
    const eyeX =  r * 0.4;

    // 2) Eyes (circles only) — size changes
    let er = null;
    if (has(eyeSizeT)) {
      er = r * (0.06 + eyeSizeT * 0.09); // 6(open big) -> 1(small)
      [-1, +1].forEach(side => {
        g.append("circle")
          .attr("cx", side * eyeX).attr("cy", eyeY).attr("r", er)
          .attr("fill", "#000000");
      });
    }

    // 5) Dark circles under eyes
    if (has(underEyeT)) {
      const intensity = 1 -underEyeT;

      const baseEyeR = (er != null) ? er : (r * 0.10);
      const ur = baseEyeR * 2;
      const bottomA = 0.08 + intensity * 0.7;
      const midA = bottomA * 0.45;

      // unique IDs per face instance
      const uid = Math.random().toString(36).slice(2);
      const gradId = `undereye-grad-${uid}`;
      const clipId = `undereye-clip-${uid}`;

      const defs = g.append("defs");

      // gradient: transparent at top -> darker at bottom
      const grad = defs.append("linearGradient")
        .attr("id", gradId)
        .attr("x1", "0%").attr("y1", "0%")
        .attr("x2", "0%").attr("y2", "100%");

      grad.append("stop").attr("offset", "0%").attr("stop-color", `rgba(0,0,0,0)`);
      grad.append("stop").attr("offset", "50%").attr("stop-color", `rgba(0,0,0,${midA})`);
      grad.append("stop").attr("offset", "100%").attr("stop-color", `rgba(0,0,0,${bottomA})`);

      // clip to get a semi-circle under the eye
      defs.append("clipPath")
        .attr("id", clipId)
        .append("rect")
          .attr("x", -r)               // wide enough
          .attr("y", eyeY)             // start at eye center
          .attr("width", 2 * r)
          .attr("height", r);

      [-1, +1].forEach(side => {
        g.append("circle")
          .attr("cx", side * eyeX)
          .attr("cy", eyeY)            // same center as eye
          .attr("r", ur)
          .attr("fill", `url(#${gradId})`)
          .attr("clip-path", `url(#${clipId})`);
      });
    }

    // 4) Eyebrows — tilt + height change
    if (has(browT)) {
      const intensity = 1 - browT;

      const by = -r * 0.45;               // vertical position of brows
      const maxW = 0.4 + (r * 0.5 * intensity);              // max brow width
      const bw = maxW; // shrink for higher values

      const curve = intensity * r * 0.1; // curvature height
      const strokeW = r * 0.055 + 1.5 * intensity;

      [-1, +1].forEach(side => {
        const x0 = side * (eyeX - bw / 2);
        const x2 = side * (eyeX + bw / 2);
        const xm = side * eyeX;

        // Semicircle when strong, flat when weak
        const y0 = by;
        const y2 = by;
        const ym = by - curve;

        g.append("path")
          .attr("d", `M ${x0} ${y0} Q ${xm} ${ym} ${x2} ${y2}`)
          .attr("stroke", "#000000")
          .attr("stroke-width", strokeW)
          .attr("stroke-linecap", "round")
          .attr("fill", "none");
      });
    }

    // 3) Mouth — half-pie arc: smile -> flat -> frown
    if (has(mouthT)) {
      const mouthY = r * 0.4;
      const mw = r * 0.7;

      // mouthT: 0 happy ... 0.5 flat ... 1 sad
      const signed = (mouthT - 0.5) * 2;     // -1..+1
      const curv = signed * r * 0.55;        // +down (frown), -up (smile)

      // mouth outline arc
      g.append("path")
        .attr("d", `M ${-mw/2} ${mouthY} Q 0 ${mouthY + curv} ${mw/2} ${mouthY}`)
        .attr("fill", "none")
        .attr("stroke", "#2b2b2b")
        .attr("stroke-width", 2.5)
        .attr("stroke-linecap", "round");
    }

    // 6) Chin shadow (curved arc like in the reference)
    if (has(chinT)) {
      //const a = 0.06 + (1 - chinT) * 0.26;
      const cy = r * 0.8;
      const cw = 1+ r * 0.7 * (1-chinT);
      const ch = r * 0.1;

      g.append("path")
        .attr("d", `M ${-cw/2} ${cy} Q 0 ${cy + ch} ${cw/2} ${cy}`)
        .attr("fill", "none")
        .attr("stroke", `rgba(0,0,0)`)
        .attr("stroke-width", 0.75 + 1.5 * (1 - chinT))
        .attr("stroke-linecap", "round");
    }

    // 7) Pimples
    if (has(pimplesT)) {
      const t = 1 - pimplesT;                 // 0..1
      const count = Math.round(1 + t * 5);
      const pr = Math.max(1.2, r * (0.03 + t * 0.04));   // pimple radius scales a bit

      // place them on cheeks/chin area (fixed pattern so it looks consistent)
      const spots = [
        [-0.60,  0.15], [-0.70,  0.25], [-0.50,  0.25], // left cheek
        [ 0.60,  0.15], [ 0.70,  0.25], [ 0.50,  0.25], // right cheek
      ].map(([sx, sy]) => [sx * r, sy * r]);

      // draw first N spots
      spots.slice(0, count).forEach(([px, py]) => {
        g.append("circle")
          .attr("cx", px)
          .attr("cy", py)
          .attr("r", pr)
          .attr("fill", "rgba(0, 0, 0, 0.75)");
      });
    }
  }

  colsX.forEach(c => {
    const meanMap = q2Mean.get(c.col);
    const face = faceFromQ2Means(meanMap);

    const cx = x(c.col) + x.bandwidth()/2;

    gEmoji.append("g")
      .attr("transform", `translate(${cx},${emojiY+15})`)
      .style("cursor", "default")
      .on("mouseover", (event) => {
        const Q2_FEATURE_MAP = {
          Q2_1: "Face tone",
          Q2_2: "Eye size",
          Q2_3: "Mouth shape",
          Q2_4: "Brow shape",
          Q2_5: "Under-eye",
          Q2_6: "Chin",
          Q2_7: "Pimples",
        };
        const f2 = v => (v == null ? "null" : v.toFixed(2));
        const r16 = v => (v == null ? "null" : Math.max(1, Math.min(6, Math.round(v))));
        const q2Html = Q2_COLS.map(q2 => {
          const feat  = Q2_FEATURE_MAP[q2] || q2;
          const mean  = meanMap.get(q2);
          return `${feat}: ${f2(mean)} <span style="opacity:.7">[${r16(mean)}]</span>`;
        }).join("<br/>");
        showTooltip(
          `<strong>${c.label}</strong><br/>
           ${q2Html}`,
          event
        );
      })
      .on("mousemove", moveTooltip)
      .on("mouseout", hideTooltip)
      .each(function(){ drawFace(d3.select(this), face, emojiAreaHeight*0.8); });
  });

  // X-axis title (multi-line using tspan)
  const xAxisTitle = svg.append("text")
    .attr("x", w / 2)
    .attr("y", emojiY * 1.07)
    .attr("text-anchor", "middle")
    .attr("class", "axis-title")
    .attr("font-size", `${width * 0.025}px`);

  xAxisTitle.append("tspan")
    .attr("x", w / 2)
    .text("X-axis: Ways in which information on cybersecurity was received in the past (Q1)");

  xAxisTitle.append("tspan")
    .attr("x", w / 2)
    .attr("dy", "1.2em")
    .text("Emojis show the feedback on the experience (Q2).");

  // changed here for the lengend alignment
  // Q2 Legend (mapping questions to face features)
  const Q2_FEATURE_MAP = {
    Q2_1: "Face tone",
    Q2_2: "Eye size",
    Q2_3: "Mouth shape",
    Q2_4: "Brow shape",
    Q2_5: "Under-eye",
    Q2_6: "Chin",
    Q2_7: "Pimples",
  };

  const legendStartY = emojiY  * 1.12
  const legendLineH = width * 0.025;

  // title
  svg.append("text")
    .attr("x", 0) // inside translated group, 0 is left edge (better than margin.left)
    .attr("y", legendStartY)
    .attr("class", "axis-title")
    .attr("font-size", `${width * 0.021}px`)
    .attr("font-weight", "bold")
    .text("Mapping of feedback with emoji features:");

  // legend items as strings
  const legendItems = Q2_COLS.map(q2 => {
    const label = labelText(labelRows, q2);
    const feature = Q2_FEATURE_MAP[q2] || q2;
    return `${label} = ${feature}`;
  });

  // wrap items across available width
  const gLegend = svg.append("g").attr("class", "q2-legend");

  let xCursor = 0;
  let yCursor = legendStartY*1.02;
  const maxW = w;           // available inner width
  const gap = width * 0.05;           // space between items

  legendItems.forEach(txt => {
    // create once to measure width
    const t = gLegend.append("text")
      .attr("x", xCursor)
      .attr("y", yCursor)
      .attr("text-anchor", "start")
      .attr("class", "legend-text")
      .attr("font-size", `${width * 0.02}px`)
      .text(txt);

    const tw = t.node().getComputedTextLength();

    // if it overflows, move to next line
    if (xCursor > 0 && xCursor + tw > maxW) {
      t.remove();
      xCursor = 0;
      yCursor += legendLineH;

      gLegend.append("text")
        .attr("x", xCursor)
        .attr("y", yCursor)
        .attr("text-anchor", "start")
        .attr("class", "legend-text")
        .attr("font-size", `${width * 0.02}px`)
        .text(txt);

      // measure again (safe)
      const tw2 = gLegend.select("text:last-child").node().getComputedTextLength();
      xCursor += tw2 + gap;
    } else {
      xCursor += tw + gap;
    }
  });


  // Y-axis title
  const yCenter = barAreaHeight + matrixHeight / 2;
  svg.append("text")
    .attr("x", -(width * 0.01))
    .attr("y", yCenter)
    .attr("transform", `rotate(-90,-${width * 0.01},${yCenter})`)
    .attr("text-anchor", "middle")
    .attr("class", "axis-title")
    .attr("font-size", `${width * 0.025}px`)
    .text("Y-axis: Preferred ways to receive information on Cybersecurity (Q5).");

  // Adjust viewBox to fit all content
  const bbox = svg.node().getBBox();
  svgRoot.attr("viewBox", `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
}