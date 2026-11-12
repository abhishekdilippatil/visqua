# Visual Questionnaire Analytics (VisQuA)

**Bauhaus Universität Weimar - Faculty of Media - Virtual Reality and Visualization** 

**Winter Semester 2025/26**

**Contributors:** Daniel Cristianindra Radianto 128230, Theresa Johanna Genßler 122344, Ramakrishnareddy Parvatareddy 126028, Abhishek Dilip Patil 127126

**Supervisors:** M.F.A. M.Sc. Irene López García, M.Sc. Dora Kiesel

**Professor:** Prof. Dr. rer. nat. Bernd Fröhlich

An interactive data visualization dashboard for exploring cybersecurity information preferences. Built with [D3.js v7](https://d3js.org/), it allows users to analyze survey data across multiple linked chart views with demographic filtering.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Core Application Structure](#core-application-structure)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Charts & Interactions](#charts--interactions)
- [Data Format](#data-format)
- [Architecture](#architecture)
- [Development Notes](#development-notes)
- [Ideas For Future Work](#ideas-for-future-work)

---

## Overview


This dashboard presents survey insights on cybersecurity information behaviors across four key dimensions: the channels people have historically used to receive cybersecurity information (Q1), their satisfaction with those channels (Q2), their preferred channels going forward (Q5), and the time they're willing to invest in getting and staying informed (Q9). The four chart types are fully linked in a coordinated view, with demographic filters for flexible data exploration.


---

## Features

- **Coordinated multiple views** – clicking in one chart filters all others
- **Stacked filter system** – filters from different charts are applied simultaneously (AND logic)
- **Demographic filters** – filter by age group, gender, victim status, and profession
- **Active filter chips** – always-visible header showing which filters are applied
- **Responsive layout** – adapts to different screen sizes

---

## Core Application Structure

```
visqua/
├── src/
│   ├── index.html          # Main entry point
│   ├── css/
│   │   └── style.css       # All styles
│   └── data/
│       ├── Cleaned_data_trimmed.csv   # Survey dataset
│       └── ...
│   ├── js/
│   │   ├── index.js        # App bootstrap, modal & filter chip logic
│   │   ├── DataManager.js  # Central state & filter engine
│   │   ├── Matrix.js       # Received vs. Preferred matrix chart
│   │   ├── Linechart.js    # 
│   │   ├── Upset.js        # UpSet plot for Q1 combinations
│   │   ├── Trellis.js      # Trellis lollipop chart (Q5 × Q9)
│   │   └── Filters.js      # Demographic filter bar charts
├── bs-config.json          # lite-server configuration
├── package.json
├── README.md 
└── ...

```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher recommended)
- npm (comes with Node.js)

### Installation

```bash
# 1. Clone the repository
git clone https://gitlab.uni-weimar.de/vipe7209/visqua.git
cd visqua

# 2. Install dependencies
npm install

# 3. Start the development server
npm start
```

The app will open automatically in your browser at `http://localhost:3000`.

> **Note:** Always run `npm install` first after pulling from git. The `node_modules` folder is not tracked in version control.

---

## Usage

### Demographic Filters

Click the **Filters** button in the top-right corner to open the filter panel. You can filter by:

| Filter        | Column   | Type          |
|---------------|----------|---------------|
| Age group     | DEM2     | Single select |
| Gender        | Gender   | Multi-select  |
| Victim status | DEM8     | Multi-select  |
| Profession    | DEM6_SE  | Multi-select  |

- **Remove filters** (in the modal header) – clears only demographic filters
- **Remove filters** (in the page header) – clears all filters, including chart selections

Active filters are displayed as chips between the page title and the buttons.

### Chart Interactions

- **Click** a chart element to apply a filter and highlight related data across all views
- **Click again** on the same element to deselect and clear that filter
- Filters from different charts stack (AND logic) – the dataset shrinks to only rows matching all active filters
- **Double-click** the UpSet chart background to reset all filters

---

## Charts & Interactions

### Matrix (Received × Preferred)
Shows the relationship between how respondents received cybersecurity information (x-axis) and how they prefer to receive it (y-axis). Each cell is split into 3 vertical sections representing preference rank 1, 2, and 3, colored by count intensity.

- Emoji faces below the x-axis visualize average feedback scores per channel
- Top bars show the overall count per channel
- Click a cell section to filter by that combination

### Nested Bar Charts
This visualization illustrates the relationship between respondents' preferred media for receiving cybersecurity information (bottom bars) and their reported appreciation levels for that information (top stacked bars).

- Stacked bar above shows the appreciation level of each media, and categorized into three levels: Low (ratings 1-2), medium (ratings 3-4), and high (ratings 5-6)
- The lower bar chart indicates the frequency of media selected as a top preference (Rank 1–3) by respondents.
- Click the bottom bar to highlight the appreciation of each media. Hovering into the stacked bar chart above will show information of the percentage each appreciation levels

### UpSet Plot
Shows the most frequent combinations of which sets of channels a respondent was exposed to.

- Use the radio buttons to switch between Top 20 / 40 / 80 / 100 / All combinations
- For "All", a scroll slider appears to pan through the full chart
- Click a combination column to filter all other charts to those respondents

### Trellis of Lollipops
Small multiples: one panel per desired weekly time investment, each showing preference counts as lollipop charts with three ranks colored separately.

- Click a rank label in the legend to mute/unmute that rank across all panels
- Click a lollipop stem or head to reorder the x-axis by that rank within all panels simultaneously
- Click a panel's time-category label to filter all charts to that duration people are willing to spent

---

## Data Format

The dashboard expects a CSV file at `src/data/Cleaned_data_trimmed.csv`.

- **Row 0** is treated as a label/description row (used for tooltips)
- **Rows 1+** are the actual survey responses

Key column families:

| Prefix    | Meaning                                                             |
|-----------|---------------------------------------------------------------------|
| `Q1_*`    | Ways cybersecurity information was received (Yes/No)                |
| `Q1x2_*`  | Rating of how much the respondent appreciated each channel (Likert) |
| `Q2_*`    | Feedback on the experience (1–6 scale, used for emoji faces)        |
| `Q5_*`    | Preferred channels (ranked 1–3)                                     |
| `Q9`      | Desired weekly time investment                                      |
| `DEM2`    | Age group                                                           |
| `Gender`  | Gender                                                              |
| `DEM8`    | Victim status                                                       |
| `DEM6_SE` | Profession                                                          |

---

## Architecture

All chart modules communicate through a central **DataManager (`DM`)** singleton in `DataManager.js`.

```
User interaction
      │
      ▼
  Chart module  ──► DM.setFilter(filter, source)
                         │
                         ▼
                   applyFilter()   ← demographics + stacked chart filters
                         │
                         ▼
                   broadcast()     ── CustomEvent "data_changed"
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
           Matrix    Trellis    Upset ...   (all redraw)
```

**Filter stacking:** Each chart registers its own filter keyed by a unique `source` string. Multiple filters are applied with AND logic. Clearing a chart's filter removes only that source from the stack, leaving other charts' filters intact.

---

## Development Notes

- D3.js is loaded via CDN (`https://cdn.jsdelivr.net/npm/d3@7/+esm`) as an ES module – no local bundler needed
- The development server is `lite-server` with live reload
- Browser storage is not used; all state is held in `DataManager.js` for the session

---

## Ideas for Future Work

Enable comparative analysis by allowing users to apply and compare two independent filter states side-by-side across all visualizations.

Enhance tooltips to display contextual comparisons, such as how selected subsets differ from the overall dataset distribution.

Improve accessibility by making the dashboard fully responsive and usable across different devices and screen sizes.

Conduct user studies or expert reviews to assess the effectiveness and usability of the dashboard, ensuring that the visualizations and interactions support correct interpretation of the data.