import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { DM } from "./DataManager.js";

/*
===============================================================================
Filters (Demographic Filter Module)
-------------------------------------------------------------------------------
Handles all demographic filter visualizations.

Responsibilities:
- Render Age (single select)
- Render Gender (multi-select)
- Render Victim (multi-select)
- Render Profession (multi-select with rotated labels)
- Update DataManager when selections change
- Re-render on global data updates
===============================================================================
*/

// ============================================================================
// COLUMN REFERENCES
// ============================================================================
const AGE_GROUP_COLUMN = "DEM2";
const GENDER_COLUMN = "Gender";
const VICTIM_COLUMN = "DEM8";
const PROFESSION_COLUMN = "DEM6_SE";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Parse "18-24" -> 18 so age groups appear in a natural order.
function getAgeStartNumber(ageGroupLabel) {
  const match = String(ageGroupLabel).match(/\d+/);
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
}

// Read all clean category values from the full dataset.
// This is used to keep the same bars visible even when a category count becomes 0.
function getUniqueCleanValues(columnName) {
  const baseRows = DM.baseRows || [];
  const values = new Set();

  for (const row of baseRows) {
    const rawValue = String(row[columnName] ?? "").trim();
    const lowerValue = rawValue.toLowerCase();
    if (!rawValue) continue;
    if (lowerValue === "na" || lowerValue === "null") continue;
    values.add(rawValue);
  }

  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

// ============================================================================
// AGE FILTER
// - Age reacts to the other demographic filters
// - Its own selection is excluded from the preview counts
// ============================================================================
function getAgeGroupCounts() {
  const previewRows = DM.getRowsForDemographic("ageGroup") || [];

  const countsByAgeGroup = d3.rollup(
    previewRows,
    rows => rows.length,
    row => String(row[AGE_GROUP_COLUMN] ?? "").trim()
  );

  return Array.from(countsByAgeGroup, ([ageGroup, count]) => ({ ageGroup, count }))
    .filter(item => /^\d+\s*-\s*\d+$/.test(item.ageGroup))
    .sort((a, b) => getAgeStartNumber(a.ageGroup) - getAgeStartNumber(b.ageGroup));
}

function drawAgeGroupBarChart() {
  const chartContainer = document.getElementById("age-filter-chart");
  const hintContainer = document.getElementById("age-filter-hint");
  if (!chartContainer) return;

  if (!DM.baseRows?.length) {
    chartContainer.innerHTML = "";
    if (hintContainer) hintContainer.textContent = "Loading age groups…";
    return;
  }

  const ageGroupData = getAgeGroupCounts();
  const selectedAgeGroup = DM.demographic?.ageGroup ?? null;

  chartContainer.innerHTML = "";

  const svgWidth = chartContainer.clientWidth || 360;
  const svgHeight = chartContainer.clientHeight || 180;

  const margin = { top: 10, right: 10, bottom: 30, left: 40 };
  const innerWidth = Math.max(10, svgWidth - margin.left - margin.right);
  const innerHeight = Math.max(10, svgHeight - margin.top - margin.bottom);

  const svg = d3.select(chartContainer)
    .append("svg")
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("viewBox", `0 0 ${svgWidth} ${svgHeight}`);

  const chartGroup = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const xScale = d3.scaleBand()
    .domain(ageGroupData.map(item => item.ageGroup))
    .range([0, innerWidth])
    .padding(0.25);

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(ageGroupData, item => item.count) || 1])
    .nice()
    .range([innerHeight, 0]);

  // Age uses a focus + context style:
  // the selected age stays black and the remaining bars turn grey.
  chartGroup.selectAll("rect")
    .data(ageGroupData)
    .join("rect")
    .attr("x", item => xScale(item.ageGroup))
    .attr("y", item => yScale(item.count))
    .attr("width", xScale.bandwidth())
    .attr("height", item => innerHeight - yScale(item.count))
    .attr("rx", 3)
    .attr("fill", item => {
      if (!selectedAgeGroup) return "#000";
      return item.ageGroup === selectedAgeGroup ? "#000" : "#d1d5db";
    })
    .attr("opacity", 1)
    .attr("stroke", item => (item.ageGroup === selectedAgeGroup ? "#111827" : "none"))
    .attr("stroke-width", item => (item.ageGroup === selectedAgeGroup ? 2 : 0))
    .style("cursor", "pointer")
    .on("click", (_, item) => {
      const currentAgeGroup = DM.demographic?.ageGroup ?? null;
      const nextAgeGroup = item.ageGroup === currentAgeGroup ? null : item.ageGroup;
      DM.setAgeGroupFilter(nextAgeGroup, "filters_age");
    });

  chartGroup.selectAll(".bar-count")
    .data(ageGroupData)
    .join("text")
    .attr("class", "bar-count")
    .attr("x", item => xScale(item.ageGroup) + xScale.bandwidth() / 2)
    .attr("y", item => yScale(item.count) - 3)
    .attr("text-anchor", "middle")
    .attr("font-size", 10)
    .attr("fill", item => {
      if (!selectedAgeGroup) return "#111827";
      return item.ageGroup === selectedAgeGroup ? "#111827" : "#9ca3af";
    })
    .text(item => item.count);

  chartGroup.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(xScale))
    .selectAll("text")
    .attr("font-size", 10);

  chartGroup.append("g")
    .call(d3.axisLeft(yScale).ticks(4))
    .selectAll("text")
    .attr("font-size", 10);

  if (hintContainer) {
    hintContainer.textContent = selectedAgeGroup
      ? `Selected: ${selectedAgeGroup} (click again to clear)`
      : "Click a bar to filter the dashboard.";
  }
}

// ============================================================================
// GENERIC CATEGORY COUNTS
// - Used by Gender, Victim and Profession
// - Counts are based on preview rows so the demographic charts react to each other
// ============================================================================
function getCategoryCounts(columnName, previewRows) {
  const allCategoryValues = getUniqueCleanValues(columnName);

  const countsByCategory = d3.rollup(
    previewRows || [],
    rows => rows.length,
    row => String(row[columnName] ?? "").trim()
  );

  return allCategoryValues
    .map(categoryValue => ({
      key: categoryValue,
      count: countsByCategory.get(categoryValue) || 0
    }))
    .sort((a, b) => (b.count - a.count) || a.key.localeCompare(b.key));
}

function drawMultiSelectBarChart({
  containerId,
  columnName,
  selectedValues,
  onToggleValue,
  heightFallback = 140,
  rotateXTicks = false,
  xTickRotateDeg = -60
}) {
  const chartContainer = document.getElementById(containerId);
  if (!chartContainer) return;

  if (!DM.baseRows?.length) {
    chartContainer.innerHTML = "";
    return;
  }

  // Each filter chart reacts to the other demographic filters,
  // but excludes its own selection while computing preview counts.
  let previewRows = DM.currentRows || [];

  if (columnName === GENDER_COLUMN) {
    previewRows = DM.getRowsForDemographic("genders") || [];
  }
  if (columnName === VICTIM_COLUMN) {
    previewRows = DM.getRowsForDemographic("dem8") || [];
  }
  if (columnName === PROFESSION_COLUMN) {
    previewRows = DM.getRowsForDemographic("dem6se") || [];
  }

  const chartData = getCategoryCounts(columnName, previewRows);
  const selectedSet = new Set(selectedValues || []);

  chartContainer.innerHTML = "";

  const svgWidth = chartContainer.clientWidth || 360;
  const svgHeight = chartContainer.clientHeight || heightFallback;

  const margin = {
    top: 10,
    right: 10,
    bottom: rotateXTicks ? 70 : 30,
    left: 40
  };

  const innerWidth = Math.max(10, svgWidth - margin.left - margin.right);
  const innerHeight = Math.max(10, svgHeight - margin.top - margin.bottom);

  const svg = d3.select(chartContainer)
    .append("svg")
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("viewBox", `0 0 ${svgWidth} ${svgHeight}`);

  const chartGroup = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const xScale = d3.scaleBand()
    .domain(chartData.map(item => item.key))
    .range([0, innerWidth])
    .padding(0.25);

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(chartData, item => item.count) || 1])
    .nice()
    .range([innerHeight, 0]);

  // Multi-select charts use the same focus + context pattern:
  // selected values stay black and the remaining bars turn grey.
  chartGroup.selectAll("rect")
    .data(chartData)
    .join("rect")
    .attr("x", item => xScale(item.key))
    .attr("y", item => yScale(item.count))
    .attr("width", xScale.bandwidth())
    .attr("height", item => innerHeight - yScale(item.count))
    .attr("rx", 3)
    .attr("fill", item => {
      if (!selectedSet.size) return "#000";
      return selectedSet.has(item.key) ? "#000" : "#d1d5db";
    })
    .attr("opacity", 1)
    .attr("stroke", item => (selectedSet.has(item.key) ? "#111827" : "none"))
    .attr("stroke-width", item => (selectedSet.has(item.key) ? 2 : 0))
    .style("cursor", "pointer")
    .on("click", (_, item) => onToggleValue(item.key));

  chartGroup.selectAll(".bar-count")
    .data(chartData)
    .join("text")
    .attr("class", "bar-count")
    .attr("x", item => xScale(item.key) + xScale.bandwidth() / 2)
    .attr("y", item => yScale(item.count) - 3)
    .attr("text-anchor", "middle")
    .attr("font-size", 10)
    .attr("fill", item => {
      if (!selectedSet.size) return "#111827";
      return selectedSet.has(item.key) ? "#111827" : "#9ca3af";
    })
    .text(item => item.count);

  const xAxisGroup = chartGroup.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(xScale));

  xAxisGroup.selectAll("text")
    .attr("font-size", 10);

  // Profession labels are rotated so long categories do not collide.
  if (rotateXTicks) {
    xAxisGroup.selectAll("text")
      .attr("text-anchor", "end")
      .attr("transform", `rotate(${xTickRotateDeg})`)
      .attr("dx", "-0.6em")
      .attr("dy", "0.15em");
  }

  chartGroup.append("g")
    .call(d3.axisLeft(yScale).ticks(4))
    .selectAll("text")
    .attr("font-size", 10);
}

// ============================================================================
// SPECIFIC FILTER CHARTS
// ============================================================================
function drawGenderBarChart() {
  drawMultiSelectBarChart({
    containerId: "gender-filter",
    columnName: GENDER_COLUMN,
    selectedValues: DM.demographic?.genders || [],
    onToggleValue: genderValue => {
      const nextSelectedValues = new Set(DM.demographic?.genders || []);
      if (nextSelectedValues.has(genderValue)) nextSelectedValues.delete(genderValue);
      else nextSelectedValues.add(genderValue);

      DM.setGenderFilter(Array.from(nextSelectedValues));
    },
    heightFallback: 140
  });
}

function drawVictimBarChart() {
  drawMultiSelectBarChart({
    containerId: "victim-filter",
    columnName: VICTIM_COLUMN,
    selectedValues: DM.demographic?.dem8 || [],
    onToggleValue: victimValue => {
      const nextSelectedValues = new Set(DM.demographic?.dem8 || []);
      if (nextSelectedValues.has(victimValue)) nextSelectedValues.delete(victimValue);
      else nextSelectedValues.add(victimValue);

      DM.setDemFilter("dem8", Array.from(nextSelectedValues), "filters_dem8");
    },
    heightFallback: 120
  });
}

function drawProfessionBarChart() {
  drawMultiSelectBarChart({
    containerId: "profession-filter",
    columnName: PROFESSION_COLUMN,
    selectedValues: DM.demographic?.dem6se || [],
    onToggleValue: professionValue => {
      const nextSelectedValues = new Set(DM.demographic?.dem6se || []);
      if (nextSelectedValues.has(professionValue)) nextSelectedValues.delete(professionValue);
      else nextSelectedValues.add(professionValue);

      DM.setDemFilter("dem6se", Array.from(nextSelectedValues), "filters_dem6se");
    },
    heightFallback: 160,
    rotateXTicks: true,
    xTickRotateDeg: -60
  });
}

// ============================================================================
// RENDER WIRING
// ============================================================================
function redrawFilters() {
  drawAgeGroupBarChart();
  drawGenderBarChart();
  drawVictimBarChart();
  drawProfessionBarChart();
}

window.addEventListener("data_changed", redrawFilters);
window.addEventListener("resize", redrawFilters);

export {
  drawAgeGroupBarChart,
  drawGenderBarChart,
  drawVictimBarChart,
  drawProfessionBarChart,
  redrawFilters
};
