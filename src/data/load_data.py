import pyreadstat
import pandas as pd
import json

"""
#load .sav
df, meta = pyreadstat.read_sav("raw_data.sav")

#Convert to JSON
df.to_json("raw_data.json", orient="records", force_ascii=False)

# Convert to CSV
df.to_csv("raw_data.csv", index=False)

# Extract labels
labels = {
    "column_labels": meta.column_labels,
    "variable_value_labels": meta.variable_value_labels
}

# Save labels as JSON
with open("raw_data_metadata.json", "w", encoding="utf-8") as f:
    json.dump(labels, f, ensure_ascii=False, indent=2)
"""

# Read Excel (first sheet by default)
df = pd.read_excel("Cleaned_data.xlsx")

#Convert to JSON
df.to_json("raw_data_from_xlsx.json", orient="records", force_ascii=False)

# Convert to CSV
df.to_csv("raw_data_from_xlsx.csv", index=False)