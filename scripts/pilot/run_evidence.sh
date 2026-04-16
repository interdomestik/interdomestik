#!/bin/bash
export PILOT_ID="pilot-ks-expand-readiness-2026-04-15"
export PILOT_OWNER="Platform Pilot Operator"

zsh -ic "pnpm pilot:evidence:record -- --pilotId \"$PILOT_ID\" --day 2 --date 2026-04-17 --owner \"$PILOT_OWNER\" --status green --incidentCount 0 --highestSeverity none --decision continue --bundlePath \"docs/pilot/live-data/${PILOT_ID}_day-2_claim-timeline-export.csv\" --reportPath \"docs/release-gates/2026-04-15_production_dpl_3TpgxBv2mYmeHVrt25PWRCoGE1t1.md\""
zsh -ic "pnpm pilot:observability:record -- --pilotId \"$PILOT_ID\" --reference day-2 --date 2026-04-17 --owner \"$PILOT_OWNER\" --logSweepResult clear --functionalErrorCount 0 --expectedAuthDenyCount 0 --kpiCondition watch --incidentCount 0 --highestSeverity none --notes \"PD02 progression verified\""
zsh -ic "pnpm pilot:decision:record -- --pilotId \"$PILOT_ID\" --reviewType daily --reference day-2 --date 2026-04-17 --owner \"$PILOT_OWNER\" --decision continue --observabilityRef day-2"

zsh -ic "pnpm pilot:evidence:record -- --pilotId \"$PILOT_ID\" --day 3 --date 2026-04-20 --owner \"$PILOT_OWNER\" --status green --incidentCount 0 --highestSeverity none --decision continue --bundlePath \"docs/pilot/live-data/${PILOT_ID}_day-3_claim-timeline-export.csv\" --reportPath \"docs/release-gates/2026-04-15_production_dpl_3TpgxBv2mYmeHVrt25PWRCoGE1t1.md\""
zsh -ic "pnpm pilot:observability:record -- --pilotId \"$PILOT_ID\" --reference day-3 --date 2026-04-20 --owner \"$PILOT_OWNER\" --logSweepResult clear --functionalErrorCount 0 --expectedAuthDenyCount 0 --kpiCondition watch --incidentCount 0 --highestSeverity none --notes \"PD03 progression verified\""
zsh -ic "pnpm pilot:decision:record -- --pilotId \"$PILOT_ID\" --reviewType daily --reference day-3 --date 2026-04-20 --owner \"$PILOT_OWNER\" --decision continue --observabilityRef day-3"
