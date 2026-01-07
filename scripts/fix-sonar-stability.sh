#!/bin/bash

SONAR_HOME="/Applications/sonarqube-25.12.0.117093"
CONFIG_FILE="$SONAR_HOME/conf/sonar.properties"
BACKUP_FILE="$SONAR_HOME/conf/sonar.properties.bak.$(date +%s)"

echo "🛠️  Applying Permanent Fixes for SonarQube Stability..."

# 1. Backup existing config
echo "📦 Backing up config to $BACKUP_FILE..."
cp "$CONFIG_FILE" "$BACKUP_FILE"

# 2. Increase Elasticsearch Memory (The root cause of corruption)
# We use sed to uncomment or replace the lines.
# Default is usually small (512m), bumping to 2G for stability.

if grep -q "^sonar.search.javaOpts" "$CONFIG_FILE"; then
    # Replace existing
    sed -i '' 's/^sonar.search.javaOpts=.*/sonar.search.javaOpts=-Xmx2G -Xms1G -XX:+HeapDumpOnOutOfMemoryError/' "$CONFIG_FILE"
else
    # Append if missing
    echo "" >> "$CONFIG_FILE"
    echo "# GEMINI-FIX: Increased memory to prevent index corruption" >> "$CONFIG_FILE"
    echo "sonar.search.javaOpts=-Xmx2G -Xms1G -XX:+HeapDumpOnOutOfMemoryError" >> "$CONFIG_FILE"
fi

# 3. Increase Web Server Memory (Helps with large report processing)
if grep -q "^sonar.web.javaOpts" "$CONFIG_FILE"; then
    sed -i '' 's/^sonar.web.javaOpts=.*/sonar.web.javaOpts=-Xmx2G -Xms1G -XX:+HeapDumpOnOutOfMemoryError/' "$CONFIG_FILE"
else
    echo "sonar.web.javaOpts=-Xmx2G -Xms1G -XX:+HeapDumpOnOutOfMemoryError" >> "$CONFIG_FILE"
fi

echo "✅ Memory limits increased! (Search: 2GB, Web: 2GB)"

# 4. Clear the corrupted index (Just in case)
echo "🧹 Cleaning up old corrupted index..."
rm -rf "$SONAR_HOME/data/es8"
echo "✅ Index cleared."

# 5. Reminder for Alias
echo "--------------------------------------------------------"
echo "🎉 Fix applied. Restart SonarQube now: 'sonar-start'"
echo ""
echo "💡 PRO TIP: To prevent this in the future, ALWAYS stop SonarQube gracefully."
echo "   Add this alias to your ~/.zshrc:"
echo ""
echo "   alias sonar-stop=\"$SONAR_HOME/bin/macosx-universal-64/sonar.sh stop\""
echo "--------------------------------------------------------"
