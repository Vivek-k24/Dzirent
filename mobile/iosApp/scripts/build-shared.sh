#!/bin/sh
# Xcode build phase: builds the shared Kotlin framework for this build's SDK, architecture and
# configuration (the standard KMP task embedAndSignAppleFrameworkForXcode).
# The Supabase values come from the env file named in mobile/iosApp/local.config
# (default ~/Desktop/Dzirent/secrets/dzirent-server.env). Values are never printed.
set -e

IOS_APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE_DIR="$(cd "$IOS_APP_DIR/.." && pwd)"
LOCAL_CONFIG="$IOS_APP_DIR/local.config"

env_file="$HOME/Desktop/Dzirent/secrets/dzirent-server.env"
if [ -f "$LOCAL_CONFIG" ]; then
    configured=$(/usr/bin/tr -d '\r' < "$LOCAL_CONFIG" | /usr/bin/sed -n 's/^[[:space:]]*DZIRENT_ENV_FILE[[:space:]]*=[[:space:]]*//p' | /usr/bin/tail -n 1)
    if [ -n "$configured" ]; then
        case "$configured" in
            "~/"*) env_file="$HOME/${configured#\~/}" ;;
            *) env_file="$configured" ;;
        esac
    fi
fi

if [ ! -f "$env_file" ]; then
    echo "error: Dzirent env file not found at $env_file. Create mobile/iosApp/local.config (copy local.config.example) and set DZIRENT_ENV_FILE to the path of dzirent-server.env." >&2
    exit 1
fi
. "$IOS_APP_DIR/scripts/load-env.sh" "$env_file"

# Xcode doesn't inherit the shell's JAVA_HOME.
if [ -z "$JAVA_HOME" ]; then
    JAVA_HOME=$(/usr/libexec/java_home -v 17 2>/dev/null || /usr/libexec/java_home 2>/dev/null || true)
    export JAVA_HOME
fi
if [ -z "$JAVA_HOME" ]; then
    echo "error: No JDK found. Install JDK 17 to build the shared Kotlin code." >&2
    exit 1
fi

cd "$MOBILE_DIR"
./gradlew :shared:embedAndSignAppleFrameworkForXcode
