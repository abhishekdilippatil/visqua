import { DM } from "./DataManager.js";

// Js files
import "./Upset.js";
import "./Matrix.js";
import "./Linechart.js";
import "./Trellis.js";
import "./Filters.js";

// Datafile
DM.init("data/Cleaned_data_trimmed.csv");

// ============================================================================
// Filters modal open/close + clear buttons
// ============================================================================
function setupFiltersModal() {
  const modal = document.getElementById("filters-modal");

  // header buttons
  const openBtn = document.getElementById("btn-open-filters");
  const clearBtn = document.getElementById("btn-clear-filters"); // outside remove filters

  // modal header buttons
  const clearmodelBtn = document.getElementById("btn-clear-filters-modal"); // modal remove filters
  const closeBtn = document.getElementById("btn-close-filters");

  // these are optional (in your latest HTML they are not present)
  const cancelBtn = document.getElementById("btn-cancel-filters");
  const applyBtn = document.getElementById("btn-apply-filters");

  if (!modal || !openBtn || !clearBtn) return;

  // open modal
  const open = () => {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");

    // filters charts are already redrawn by Filters.js when DM broadcasts
    // so no extra draw call is needed here
  };

  // close modal
  const close = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  };

  openBtn.addEventListener("click", open);

  // outside remove filters:
  // clears EVERYTHING (demographic + stacked chart filters) using DM.reset()
  clearBtn.addEventListener("click", () => {
    DM.reset("remove_filters_button");
    close();
  });

  // modal remove filters:
  // clears ONLY demographic filters (age, gender, victim, profession)
  clearmodelBtn?.addEventListener("click", () => {
    DM.clearDemographicFilters("remove_demographics_only");
    close();
  });

  closeBtn?.addEventListener("click", close);
  cancelBtn?.addEventListener("click", close);
  applyBtn?.addEventListener("click", close);

  // click backdrop to close
  modal.addEventListener("click", (e) => {
    if (e.target?.dataset?.close === "true") close();
  });
}

setupFiltersModal();

// ============================================================================
// Active filters text in header (between title and buttons)
// ============================================================================


// join multiple selected values into a compact label
function joinValues(values, max = 3) {
  const arr = (values || []).filter(Boolean);
  if (arr.length <= max) return arr.join(", ");
  return `${arr.slice(0, max).join(", ")} +${arr.length - max}`;
}

function renderActiveFilters() {
  const el = document.getElementById("active-filters");
  if (!el) return;

  const chips = [];

  // demographic filters
  if (DM.demographic?.ageGroup) {
    chips.push({ k: "Age", v: String(DM.demographic.ageGroup) });
  }
  if (DM.demographic?.genders?.length) {
    chips.push({ k: "Gender", v: joinValues(DM.demographic.genders) });
  }

  // victim (you are storing it as dem8 in DM.demographic)
  if (DM.demographic?.dem8?.length) {
    chips.push({ k: "Victim", v: joinValues(DM.demographic.dem8) });
  }

  // profession
  if (DM.demographic?.dem6se?.length) {
    chips.push({ k: "Profession", v: joinValues(DM.demographic.dem6se) });
  }

  // show empty state
  if (!chips.length) {
    el.classList.add("is-empty");
    el.innerHTML = `<span style="font-size:12px;color:#6b7280;">No filters applied</span>`;
    return;
  }

  // render chips
  el.classList.remove("is-empty");
  el.innerHTML = chips
    .map(d => `<span class="filter-chip"><strong>${d.k}:</strong> ${d.v}</span>`)
    .join("");
}

// redraw header filters whenever DM updates
window.addEventListener("data_changed", renderActiveFilters);
renderActiveFilters();