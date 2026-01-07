#!/bin/bash

SONAR_HOME="/Applications/sonarqube-25.12.0.117093"
CONFIG_FILE="$SONAR_HOME/conf/sonar.properties"

echo "💾 Fixing SonarQube Disk Watermark issues..."

# Add disk threshold settings to sonar.search.javaOpts
# We append these to the existing memory fixes we made earlier.

# Current line looks like: sonar.search.javaOpts=-Xmx2G -Xms1G -XX:+HeapDumpOnOutOfMemoryError
# We want to add the disk properties to it.

DISK_OPTS="-Dcluster.routing.allocation.disk.threshold_enabled=true -Dcluster.routing.allocation.disk.watermark.low=95% -Dcluster.routing.allocation.disk.watermark.high=98% -Dcluster.routing.allocation.disk.watermark.flood_stage=99%"

sed -i '' "s|^sonar.search.javaOpts=.*|& $DISK_OPTS|" "$CONFIG_FILE"

echo "✅ Disk watermarks updated (Low: 95%, High: 98%)."
echo "🧹 Clearing index one more time to reset the 'Flood Stage' lock..."
rm -rf "$SONAR_HOME/data/es8"

echo "🚀 Restarting SonarQube..."
"$SONAR_HOME/bin/macosx-universal-64/sonar.sh" restart

echo "--------------------------------------------------------"
echo "🎉 Done! Give it 2 minutes to start up."
echo "   Monitor with: tail -f $SONAR_HOME/logs/sonar.log"
echo "--------------------------------------------------------"
