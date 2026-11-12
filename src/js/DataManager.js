import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

/*
===============================================================================
DataManager
-------------------------------------------------------------------------------
Central state manager for the dashboard.

Responsibilities:
- Load the CSV once
- Keep the original rows untouched
- Apply demographic filters
- Apply chart filters from multiple sources at the same time
- Broadcast one event so every chart can re-render from the same state

Note:
- Filters from different sources are combined with AND logic
===============================================================================
*/

export const DM = {

  // ==========================================================================
  // DATA STORAGE
  // ==========================================================================
  columns: [],        // All CSV column names
  headerRow: null,    // First row is being used as the label row in this dataset
  baseRows: [],       // Original dataset (no filters)
  currentRows: [],    // Dataset after all active filters are applied

  // ==========================================================================
  // DASHBOARD STATE
  // ==========================================================================
  filter: { kind: "reset" },  // Last applied filter (kept for compatibility)
  source: null,                // Last source that changed the state
  topN: "20",                  // Used by the UpSet chart

  // One active chart filter per source
  filters: [],

  // ==========================================================================
  // DEMOGRAPHIC FILTERS
  // ==========================================================================
  demographic: {
    ageGroup: null,   // DEM2
    genders: [],      // Gender
    dem8: [],         // DEM8
    dem6se: []        // DEM6_SE (profession)
  },

  // Guard against recursive event loops
  _syncing: false,

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================
  async init(csvPath) {
    const raw = await d3.csv(csvPath);
    if (!raw.length) return;

    this.columns = raw.columns;
    this.headerRow = raw[0];
    this.baseRows = raw.slice(1);
    this.currentRows = this.baseRows;

    this.broadcast();
  },

  // ==========================================================================
  // BROADCAST EVENT
  // ==========================================================================
  broadcast() {
    const ev = new CustomEvent("data_changed", {
      detail: {
        filter: this.filter,
        filters: this.filters,
        source: this.source,
        n: this.currentRows.length,
        topN: this.topN,
        demographic: this.demographic
      }
    });

    window.dispatchEvent(ev);
  },

  // ==========================================================================
  // RESET HELPERS
  // ==========================================================================
  reset(source = "reset") {
    this.clearDemographicFilters(source);
    this.setFilter({ kind: "reset" }, source);
  },

  // ==========================================================================
  // UPSET TOP-N CONTROL
  // ==========================================================================
  setTopN(value) {
    this.topN = value;
    this.broadcast();
  },

  // ==========================================================================
  // DEMOGRAPHIC FILTERS
  // ==========================================================================
  setAgeGroupFilter(ageGroup, source = "filters_age") {
    if (this._syncing) return;
    this._syncing = true;

    this.demographic.ageGroup = ageGroup;
    this.source = source;

    this.currentRows = this.applyFilter();
    this.broadcast();

    this._syncing = false;
  },

  setGenderFilter(genders, source = "filters_gender") {
    if (this._syncing) return;
    this._syncing = true;

    this.demographic.genders = Array.isArray(genders) ? genders : [];
    this.source = source;

    this.currentRows = this.applyFilter();
    this.broadcast();

    this._syncing = false;
  },

  // Generic setter for the other demographic chips / checkboxes
  setDemFilter(key, values, source = "filters_dem") {
    if (this._syncing) return;
    this._syncing = true;

    this.demographic[key] = Array.isArray(values) ? values : [];
    this.source = source;

    this.currentRows = this.applyFilter();
    this.broadcast();

    this._syncing = false;
  },

  clearDemographicFilters(source = "filters_clear") {
    if (this._syncing) return;
    this._syncing = true;

    this.demographic.ageGroup = null;
    this.demographic.genders = [];
    this.demographic.dem8 = [];
    this.demographic.dem6se = [];

    this.source = source;

    this.currentRows = this.applyFilter();
    this.broadcast();

    this._syncing = false;
  },

  // ==========================================================================
  // CHART FILTER CONTROL
  // ==========================================================================
  /*
    Each chart registers its own filter using a unique source key.

    Example:
      DM.setFilter({ kind: "matrix_cell", ... }, "matrix")
      DM.setFilter({ kind: "q9_minutes", ... }, "trellis")
      DM.setFilter({ kind: "q5_ranked", ... }, "radial")

    Only one filter per source is stored.
    Different sources are combined together with AND logic.
  */
  setFilter(filter, source = "unknown") {
    if (this._syncing) return;
    this._syncing = true;

    this.source = source;

    // Full reset clears the chart filter stack.
    if (!filter || filter.kind === "reset") {
      this.filter = { kind: "reset" };
      this.filters = [];
      this.currentRows = this.applyFilter();
      this.broadcast();
      this._syncing = false;
      return;
    }

    this.filter = filter;

    // Replace the existing filter from this source, keep the others.
    const next = (this.filters || []).filter(f => f.source !== source);
    next.push({ ...filter, source });
    this.filters = next;

    this.currentRows = this.applyFilter();
    this.broadcast();

    this._syncing = false;
  },

  clearFilterSource(source = "unknown") {
    if (this._syncing) return;
    this._syncing = true;

    // Remove only this chart's filter and leave the rest alone.
    this.filters = (this.filters || []).filter(f => f.source !== source);

    // Keep the old compatibility field in sync.
    this.filter = this.filters.length
      ? this.filters[this.filters.length - 1]
      : { kind: "reset" };

    this.source = source;

    this.currentRows = this.applyFilter();
    this.broadcast();

    this._syncing = false;
  },

  getFilterBySource(source) {
    return (this.filters || []).find(f => f.source === source) || null;
  },

  // Used by the demographic charts so each one can preview counts without
  // applying its own demographic field back onto itself.
  getRowsForDemographic(excludeKey) {
    const demo = {
      ageGroup: this.demographic?.ageGroup ?? null,
      genders: Array.isArray(this.demographic?.genders) ? [...this.demographic.genders] : [],
      dem8: Array.isArray(this.demographic?.dem8) ? [...this.demographic.dem8] : [],
      dem6se: Array.isArray(this.demographic?.dem6se) ? [...this.demographic.dem6se] : []
    };

    if (excludeKey === "ageGroup") demo.ageGroup = null;
    if (excludeKey === "genders") demo.genders = [];
    if (excludeKey === "dem8") demo.dem8 = [];
    if (excludeKey === "dem6se") demo.dem6se = [];

    let rows = this.baseRows;

    if (demo?.ageGroup) {
      const chosen = String(demo.ageGroup).trim();
      rows = rows.filter(r => String(r["DEM2"] ?? "").trim() === chosen);
    }

    if (demo?.genders?.length) {
      const chosen = new Set(demo.genders.map(s => String(s).trim()));
      rows = rows.filter(r => chosen.has(String(r["Gender"] ?? "").trim()));
    }

    if (demo?.dem8?.length) {
      const chosen = new Set(demo.dem8.map(s => String(s).trim()));
      rows = rows.filter(r => chosen.has(String(r["DEM8"] ?? "").trim()));
    }

    if (demo?.dem6se?.length) {
      const chosen = new Set(demo.dem6se.map(s => String(s).trim()));
      rows = rows.filter(r => chosen.has(String(r["DEM6_SE"] ?? "").trim()));
    }

    return rows;
  },

  // ==========================================================================
  // APPLY FILTER PIPELINE
  // ==========================================================================
  /*
    Filter order:
    1. Demographic filters
    2. Chart filters from all sources
  */
  applyFilter() {
    let rows = this.baseRows;

    // ------------------------------------------------------------------------
    // 1) Demographic filters
    // ------------------------------------------------------------------------
    if (this.demographic?.ageGroup) {
      const chosen = String(this.demographic.ageGroup).trim();
      rows = rows.filter(r => String(r["DEM2"] ?? "").trim() === chosen);
    }

    if (this.demographic?.genders?.length) {
      const chosen = new Set(this.demographic.genders.map(s => String(s).trim()));
      rows = rows.filter(r => chosen.has(String(r["Gender"] ?? "").trim()));
    }

    if (this.demographic?.dem8?.length) {
      const chosen = new Set(this.demographic.dem8.map(s => String(s).trim()));
      rows = rows.filter(r => chosen.has(String(r["DEM8"] ?? "").trim()));
    }

    if (this.demographic?.dem6se?.length) {
      const chosen = new Set(this.demographic.dem6se.map(s => String(s).trim()));
      rows = rows.filter(r => chosen.has(String(r["DEM6_SE"] ?? "").trim()));
    }

    // ------------------------------------------------------------------------
    // 2) Chart filters (stacked with AND logic)
    // ------------------------------------------------------------------------
    const stack = this.filters || [];
    if (!stack.length) return rows;

    const isYes = v => String(v || "").trim().toLowerCase() === "yes";

    const rankValue = v => {
      const n = +v;
      return Number.isFinite(n) && n >= 1 && n <= 3 ? n : null;
    };

    const likert = v => {
      if (v == null || v === "" || v === "null") return null;
      const n = +v;
      return Number.isFinite(n) ? n : null;
    };

    let out = rows;

    for (const filter of stack) {
      if (!filter || filter.kind === "reset") continue;

      // UpSet intersection
      if (filter.kind === "q1_intersection") {
        const usedQ1Cols = filter.usedQ1Cols || [];
        const sig = filter.sig || "";

        out = out.filter(r => {
          const yesCols = usedQ1Cols.filter(c => isYes(r[c]));
          return yesCols.join("|") === sig;
        });
        continue;
      }

      // Matrix cell filter
      if (filter.kind === "matrix_cell") {
        const { q1, q5, rank } = filter;

        out = out.filter(r => {
          const okQ1 = isYes(r[q1]);
          const rv = rankValue(r[q5]);
          const okQ5 = rank ? rv === rank : rv !== null;
          return okQ1 && okQ5;
        });
        continue;
      }

      // Radial parent bar filter
      // Supports either a single rank or a list of ranks.
      if (filter.kind === "q5_ranked") {
        const allowedRanks = Array.isArray(filter.ranks) && filter.ranks.length
          ? new Set(filter.ranks.map(v => +v).filter(Number.isFinite))
          : null;

        out = out.filter(r => {
          const rv = rankValue(r[filter.col]);
          if (rv == null) return false;
          if (allowedRanks) return allowedRanks.has(rv);
          if (filter.rank != null) return rv === +filter.rank;
          return true;
        });
        continue;
      }

      // Radial stacked segment filter
      // This keeps the clicked Q1x2 column, the appreciation band and,
      // optionally, the parent Q5 group together.
      if (filter.kind === "q1x2_rated") {
        const allowedQ5Ranks = Array.isArray(filter.q5Ranks) && filter.q5Ranks.length
          ? new Set(filter.q5Ranks.map(v => +v).filter(Number.isFinite))
          : null;

        out = out.filter(r => {
          const v = likert(r[filter.col]);
          if (v == null || v <= 0) return false;

          if (filter.level) {
            const level = String(filter.level).toLowerCase();
            if (level === "low" && !(v >= 1 && v <= 2)) return false;
            if (level === "medium" && !(v >= 3 && v <= 4)) return false;
            if (level === "high" && !(v >= 5 && v <= 6)) return false;
          }

          if (filter.q5Col) {
            const rv = rankValue(r[filter.q5Col]);
            if (rv == null) return false;

            if (allowedQ5Ranks) {
              if (!allowedQ5Ranks.has(rv)) return false;
            } else if (filter.q5Rank != null && rv !== +filter.q5Rank) {
              return false;
            }
          }

          return true;
        });
        continue;
      }

      // Trellis Q5 filter
      if (filter.kind === "q5_trellis") {
        const col = filter.col;
        const wantedRank = filter.rank ?? null;
        const alsoRequireQ1 = filter.alsoRequireQ1 || null;

        out = out.filter(r => {
          const rv = rankValue(r[col]);
          if (rv == null) return false;
          if (wantedRank && rv !== wantedRank) return false;

          if (alsoRequireQ1) {
            if (!isYes(r[alsoRequireQ1])) return false;
          }
          return true;
        });
        continue;
      }

      // Trellis Q9 (minutes) filter
      if (filter.kind === "q9_minutes") {
        const wanted = String(filter.value ?? "").trim();
        out = out.filter(r => String(r["Q9"] ?? "").trim() === wanted);
        continue;
      }
    }

    return out;
  }
};