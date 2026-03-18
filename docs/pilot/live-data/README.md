# Live Pilot Data Folder

This folder stores the repo-backed daily export inputs for the live pilot:

- daily claim timeline exports
- day-specific SQL query files
- any derived week-1 rollup inputs that support Day 7 closeout

Use this folder for the pilot:

- Pilot ID: `pilot-ks-live-2026-03-18`

## Naming Rules

Daily export files:

```text
pilot-ks-live-2026-03-18_day-N_claim-timeline-export.csv
```

Day-specific SQL files:

```text
pilot-ks-live-2026-03-18_day-N_claim-timeline-export.sql
```

## Daily Export Checklist

1. Run the day-specific SQL file against the canonical live data source.
2. Save the output CSV in this folder.
3. Record the CSV path in the matching daily sheet.
4. Fill the claim, triage, and public-update tables from the export.
5. If the export does not contain real claim rows and real timeline rows, do not write canonical evidence for that day.
