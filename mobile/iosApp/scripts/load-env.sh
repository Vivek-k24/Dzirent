#!/bin/sh
# Exports SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY from a KEY=VALUE env file (CRLF or LF).
# Usage: . load-env.sh /path/to/dzirent-server.env
# Values are never printed.
dz_env_file="$1"
if [ -z "$dz_env_file" ] || [ ! -f "$dz_env_file" ]; then
    echo "error: Dzirent env file not found: ${dz_env_file:-<empty path>}. Set DZIRENT_ENV_FILE in mobile/iosApp/Config/Local.xcconfig (copy Local.xcconfig.example) to the path of dzirent-server.env." >&2
    return 1 2>/dev/null || exit 1
fi
for dz_key in SUPABASE_URL SUPABASE_PUBLISHABLE_KEY; do
    dz_value=$(/usr/bin/tr -d '\r' < "$dz_env_file" | /usr/bin/sed -n "s/^[[:space:]]*${dz_key}[[:space:]]*=[[:space:]]*//p" | /usr/bin/tail -n 1)
    # Drop surrounding quotes if present.
    dz_value=$(printf '%s' "$dz_value" | /usr/bin/sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/")
    if [ -z "$dz_value" ]; then
        echo "error: $dz_key is missing or empty in $dz_env_file." >&2
        return 1 2>/dev/null || exit 1
    fi
    export "$dz_key=$dz_value"
done
unset dz_env_file dz_key dz_value
