import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { DM } from "./DataManager.js";

// ============================================================================
// CONFIG
// ============================================================================

const CONFIG= Object.freeze({
    RANKS : [
        {key: "rank1", label : "Rank 1", color: "#4C78A8"},
        {key: "rank2", label : "Rank 2", color: "#F58518"},
        {key: "rank3", label : "Rank 3", color: "#54A24B"},
    ],
    GRID_COLUMNS: 1,
    MARGINS: {top: 5, right: 5, bottom: 35, left: 30},
    XLABEL: {"Q5_1" : "phyle",
        "Q5_2" : "digle",
        "Q5_3" : "email",
        "Q5_4" : "selfd",
        "Q5_5" : "dbook",
        "Q5_6" : "games",
        "Q5_7" : "simul",
        "Q5_8" : "dtips",
        "Q5_9" : "broch",
        "Q5_10" : "ptips",
        "Q5_11" : "pcast",
        "Q5_12" : "other"}
});

const tooltip = d3.select("#tooltip");
let mutedRanks = new Set();

// ============================================================================
// ENTRY POINT (DM)
// ============================================================================

// Draw once DM has data, and redraw whenever filter changes
function renderFromDM() {
    if (!DM.currentRows || !DM.currentRows.length || !DM.headerRow) {
        d3.select("#chart-trellis").selectAll("*").remove();
        d3.select("#chart-trellis")
            .append("div")
            .style("color", "#6b7280")
            .style("font-size", "12px")
            .text("No rows to display.");
        return;
    }

    const rowsByTimeCategory = groupByTimeCategory(DM.currentRows);
    const descriptions = DM.headerRow;
    const informationChannels = extractInformationChannels(Object.keys(descriptions));

    const context = { rowsByTimeCategory, descriptions, informationChannels};

    renderAll(context);
}

// listen to DM broadcasts (filter changed)
window.addEventListener("data_changed", renderFromDM);

window.addEventListener("resize", renderFromDM);

// ============================================================================
// DATA PIPELINE
// ============================================================================

function groupByTimeCategory(rows) {
    return d3.group(rows, d => d["Q9"]);
}

function extractInformationChannels(columnHeaders) {
    return columnHeaders.filter(c => /^Q5_\d+$/.test(c));
}

function computeRankCounts(rows, informationChannels) {
    const initial = informationChannels.map(option => ({
        option,
        rank1: 0,
        rank2: 0,
        rank3: 0
    }));

    return rows.reduce((acc, row) => {
        acc.forEach(d => {
            const rank = +row[d.option];
            if (rank >= 1 && rank <= 3) {
                d[`rank${rank}`] += 1;
            }
        });
        return acc;
    }, initial);
}

// ============================================================================
// METRICS
// ============================================================================

function getHighestRank(rowsByTimeCategory, informationChannels) {
    return d3.max(
        Array.from(rowsByTimeCategory.values()),
        rows => {
            const aggregated = computeRankCounts(rows, informationChannels);
            return d3.max(aggregated, d =>
                d3.max(CONFIG.RANKS, r => d[r.key])
            );
        }
    );
}

function computeTickStep(highestRank){
    if (highestRank < 10) return 1;
    if (highestRank < 50) return 5;
    if (highestRank < 100) return 10;
    return 20;
}

// ============================================================================
// FORMAT UTILITIES
// ============================================================================

function parseDurationToMinutes(durationLabel){
    if (durationLabel === "None") return 0;

    const match = durationLabel.match(/\d+/);
    return match ? Number(match[0]) : 0;
}

function truncateText(text, stopChar = '[') {
    const index = text.indexOf(stopChar);
    if (index === -1) return text; // character not found → return full text
    return text.slice(0, index).trim(); // remove trailing spaces
}

// ============================================================================
// PREPARE SMALL MULTIPLES
// ============================================================================

function preparePlotData(context) {
    const { rowsByTimeCategory, informationChannels } = context;

    const timeCategories = Array.from(rowsByTimeCategory.keys())
        .sort((a,b) => parseDurationToMinutes(a) - parseDurationToMinutes(b));

    return timeCategories.map(time => {
        const rankCountsPerTime = computeRankCounts(rowsByTimeCategory.get(time), informationChannels);
        const localHighestRank = d3.max(rankCountsPerTime, d => d3.max(CONFIG.RANKS, r => d[r.key])) || 10;
        return { time, rankCountsPerTime, localHighestRank};
    });
}

// ============================================================================
// RENDERING
// ============================================================================

function renderAll(context) {
    drawLegend();
    d3.select("#chart-trellis").selectAll("*").remove();
    const plotData = preparePlotData(context);
    prepareTrellisPanels(context, plotData);

}

// ============================================================================
// LAYOUT
// ============================================================================

function prepareTrellisPanels(context, plotData) {

    const container = d3.select("#chart-trellis")
        .style("display", "flex")
        .style("flex-direction", "column")
        .style("width", "100%");

    const maxHeight = container.node().clientHeight;
    const fixedOverhead = (CONFIG.MARGINS.top + CONFIG.MARGINS.bottom) * plotData.length;
    const remainingDataSpace = maxHeight - fixedOverhead;

    const sumLocalHighestRank = d3.sum(plotData, d => d.localHighestRank);

    plotData.forEach(timeCategory => {
        const flexHeight = (timeCategory.localHighestRank / sumLocalHighestRank) * remainingDataSpace;
        const dynamicHeight = flexHeight + CONFIG.MARGINS.top + CONFIG.MARGINS.bottom;

        const panel = container.append("div")
            .attr("class", "trellis-panel")
            .style("height", `${dynamicHeight}px`);

        panel.append("div")
            .attr("class", "trellis-label")
            .append("span")
            .attr("class", "label-text-clamp")
            .text(timeCategory.time)
            .on("click", () => {
                const SRC = "trellis_label";

                // check selection from the STACK (not DM.filter)
                const active = DM.getFilterBySource(SRC);
                const isCurrentlySelected =
                    active?.kind === "q9_minutes" &&
                    active?.value === timeCategory.time;

                if (isCurrentlySelected) {
                    // clear only trellis filter (keep other chart filters)
                    DM.clearFilterSource(SRC);
                } else {
                    // apply / replace only trellis filter in the stack
                    DM.setFilter({ kind: "q9_minutes", value: timeCategory.time }, SRC);
                }
            });

        const svg = panel.append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .style("flex", "1 1 auto")
            .style("min-height", "0")
            .style("display", "block");


        drawLollipopChart(svg,
            timeCategory.rankCountsPerTime, {localHighestRank: timeCategory.localHighestRank, flexHeight},
            context);
    });
}

// ============================================================================
// LOLLIPOP CHART
// ============================================================================

function drawLollipopChart(svg, ranksPerTimeCategory, panelConfig, context) {
    const { localHighestRank, flexHeight }  = panelConfig;
    const { left, right, top} = CONFIG.MARGINS;
    const width = svg.node().clientWidth - left - right;

    const g = svg.append("g")
        .attr("transform", `translate(${left},${top})`);

    // X-axis = Information Channels
    const x = d3.scaleBand()
        .domain(ranksPerTimeCategory.map(d => d.option))
        .range([0, width])
        .padding(0.2);

    // Y-axis = scores
    const y = d3.scaleLinear()
        .domain([0, localHighestRank])
        .nice()
        .range([flexHeight, 0]);

    const offset = x.bandwidth() / 3.5;

    const scales = {x,y};
    drawAxes(g, scales, flexHeight, context);
    drawLollipop(g, ranksPerTimeCategory, scales, offset, context);
}

function drawAxes(g, scales, height, context) {
    const {x, y} = scales;
    const { rowsByTimeCategory, informationChannels, descriptions } = context;
    const xAxisG = g.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).tickFormat(d => CONFIG.XLABEL[d]));


    xAxisG.selectAll("text")
        .style("font-size", "10px")
        .attr("text-anchor", "end")
        .attr("transform", "rotate(-45)")
        .attr("dx", "-0.6em")
        .attr("dy", "0.15em")
        .on("mouseover", (event, d) => {
            const shortText = truncateText(descriptions[d]);
            showTooltip(event, d, shortText);
        })
        .on("mousemove", moveTooltip)
        .on("mouseout", hideTooltip);

    const [min, max] = y.domain();
    const highestRank = getHighestRank(rowsByTimeCategory, informationChannels)
    const tickValues = d3.range(min, max+1, computeTickStep(highestRank))

    g.append("g")
        .call(d3.axisLeft(y)
                .tickValues(tickValues)
                .tickFormat(d3.format("d")))
        .selectAll("text")
        .style("font-size", "10px");
}

function drawLollipop(g, data, scales, offset, context) {
    const {x, y} = scales;
    const { descriptions } = context;
    const groups = g.selectAll(".lollipop")
        .data(data)
        .enter()
        .append("g")
        .attr("class", "lollipop")
        .attr("transform", d => `translate(${x(d.option) + x.bandwidth() / 2},0)`);

    // Lollipop stems
    groups.selectAll("line")
        .data(d => CONFIG.RANKS.map(r => ({...r, value: d[r.key], option: d.option})))
        .enter()
        .append("line")
        .attr("x1", (d, i) => (i - 1) * offset)
        .attr("x2", (d, i) => (i - 1) * offset)
        .attr("y1", y(0))
        .attr("y2", d => y(d.value))
        .attr("stroke", d => d.color)
        .attr("stroke-width", 2)
        .attr("cursor", "pointer")
        .on("mouseover", function (event, d) {
            const shortText = truncateText(descriptions[d.option])
            showTooltip(event, d, shortText);
        })
        .on("mousemove", moveTooltip)
        .on("mouseout", hideTooltip)
        .on("click", (event, d) => {
            reorderLollipops(event, d.key, context);
            /* const rankNum = +String(d.key).replace("rank", ""); // rank1 -> 1, rank2 -> 2, ...
             const q1match = q5ToQ1(d.option);
             DM.setFilter(
             { kind: "q5_trellis", col: d.option, rank: rankNum, alsoRequireQ1: q1match},
             "trellis"
           );*/
          });

    // Lollipop heads
    groups.selectAll("circle")
        .data(d => CONFIG.RANKS.map(r => ({... r, value: d[r.key], option: d.option})))
        .enter()
        .append("circle")
        .attr("cx", (_, i) => (i - 1) * offset)
        .attr("cy", d => y(d.value))
        .attr("r", 3)
        .attr("fill", d => d.color)
        .attr("cursor", "pointer")
        .on("mouseover", function (event, d) {
            const shortText = truncateText(descriptions[d.option])
            showTooltip(event, d, shortText);
        })
        .on("mousemove", moveTooltip)
        .on("mouseout", hideTooltip)
        .on("click", (event, d) => {
          reorderLollipops(event, d.key, context);
        });
}

// ============================================================================
// INTERACTION
// ============================================================================

function reorderLollipops(event, rankKey, context){
    const { rowsByTimeCategory, informationChannels } = context;
    const panels = d3.selectAll(".trellis-panel").nodes();
    const clickedPanel = d3.select(event.currentTarget.closest(".trellis-panel")).node();

    const clickedData = computeRankCounts(
        rowsByTimeCategory.get(clickedPanel.querySelector(".trellis-label").textContent),
        informationChannels
    ).sort((a, b) => b[rankKey] - a[rankKey]);

    const newOrder = clickedData.map(d => d.option);

    panels.forEach(panel => {
        const svg = d3.select(panel).select("svg");
        const g = svg.select("g");
        const time = panel.querySelector(".trellis-label").textContent;

        const data = computeRankCounts(rowsByTimeCategory.get(time), informationChannels);

        const orderedData = newOrder.map(opt => data.find(d => d.option === opt));

        const x = d3.scaleBand()
            .domain(newOrder)
            .range([0, svg.node().clientWidth - CONFIG.MARGINS.left - CONFIG.MARGINS.right])
            .padding(0.2);

        // Transition lines
        g.selectAll(".lollipop")
            .data(orderedData, d => d.option)
            .transition()
            .duration(750)
            .attr("transform", d => `translate(${x(d.option) + x.bandwidth() / 2},0)`);

        // Update x-axis labels
        const xAxis = d3.axisBottom(x)
            .tickFormat(d => CONFIG.XLABEL[d]);

        g.select("g.x-axis")
            .transition()
            .duration(750)
            .call(xAxis)
            .selectAll("text")
            .style("font-size", "10px")
            .attr("text-anchor", "end")
            .attr("transform", "rotate(-45)")
            .attr("dx", "-0.6em")
            .attr("dy", "0.15em");
    });

}

function updateRankSaturation() {
    d3.selectAll(".lollipop line, .lollipop circle")
        .style("opacity", d =>
            mutedRanks.has(d.key) ? 0.25 : 1
        );

    d3.selectAll(".legend-item")
        .style("opacity", d =>
            mutedRanks.has(d.key) ? 0.25 : 1
        );
}

// ============================================================================
// LEGEND
// ============================================================================

function drawLegend() {
    const legend = d3.select("#legend");

    legend.selectAll("*").remove();

    const rank = legend.selectAll(".legend-rank")
        .data(CONFIG.RANKS)
        .enter()
        .append("div")
        .attr("class", "legend-rank")
        .style("cursor", "pointer")
        .on("click", (event, d) => toggleRank(d.key));


    rank.append("div")
        .attr("class", "legend-swatch")
        .style("background-color", d => d.color);

    rank.append("span")
        .text(d => d.label);
}

function toggleRank(key) {
    if (mutedRanks.has(key)) {
        mutedRanks.delete(key);
    }
    else {
        mutedRanks.add(key);
    }

    updateRankSaturation();
}

// ============================================================================
// TOOLTIP HANDLERS
// ============================================================================

function showTooltip(event, d, option) {
    const tooltipNode = tooltip.node();
    const tooltipWidth = tooltipNode.offsetWidth;

    let x = event.pageX ;

    // prevent overflow
    if (x + tooltipWidth > window.innerWidth) {
        x -= tooltipWidth;
    }

    tooltip
        .style("opacity", 1)
        .html(d.value !== undefined
            ? `<strong>${option}</strong><br/>${d.label}: ${d.value}`
            : `<strong>${option}</strong><br/>`)
        .style("left", `${x}px`)
        .style("top", `${event.pageY}px`)
        .style("transform", "translate(0, -100%)");
}

function moveTooltip(event) {
    const tooltipNode = tooltip.node();
    const tooltipWidth = tooltipNode.offsetWidth;

    let x = event.pageX ;

    // prevent overflow
    if (x + tooltipWidth > window.innerWidth) {
        x -= tooltipWidth;
    }

    tooltip
        .style("left", `${x}px`)
        .style("top", `${event.pageY}px`)
        .style("transform", "translate(0, -100%)");
}

function hideTooltip() {
    tooltip.style("opacity", 0);
}
