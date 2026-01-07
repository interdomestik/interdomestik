#!/bin/bash

SONAR_HOME="/Applications/sonarqube-25.12.0.117093"
CONFIG_FILE="$SONAR_HOME/conf/sonar.properties"

echo "☢️  Applying Nuclear Disk Fix..."

# Stop first
"$SONAR_HOME/bin/macosx-universal-64/sonar.sh" stop

# Append configs to the very end to override anything else
echo "" >> "$CONFIG_FILE"
echo "# GEMINI NUCLEAR FIX" >> "$CONFIG_FILE"
echo "sonar.search.javaOpts=-Xmx2G -Xms1G -XX:+HeapDumpOnOutOfMemoryError -Dcluster.routing.allocation.disk.threshold_enabled=false" >> "$CONFIG_FILE"
echo "sonar.web.javaOpts=-Xmx2G -Xms1G -XX:+HeapDumpOnOutOfMemoryError" >> "$CONFIG_FILE"

echo "✅ Disabled disk thresholds completely (threshold_enabled=false)."

# Clear index
rm -rf "$SONAR_HOME/data/es8"

# Start
"$SONAR_HOME/bin/macosx-universal-64/sonar.sh" start

echo "🎉 Restarted. Wait 60s."
