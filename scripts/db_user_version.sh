#!/usr/bin/env bash

# Usage
# - Print: scripts/db_user_version.sh print
# - Increment: scripts/db_user_version.sh inc
# - Decrement: scripts/db_user_version.sh dec
# - Set: scripts/db_user_version.sh set 3
# - Override DB path: scripts/db_user_version.sh --db "/custom/path/lefocus.sqlite3" print

set -euo pipefail

# Default DB path for macOS Tauri app
DEFAULT_DB_PATH="$HOME/Library/Application Support/com.stevenyang.lefocus/lefocus.sqlite3"
DB_PATH="$DEFAULT_DB_PATH"

print_usage() {
  cat <<EOF
Usage:
  $(basename "$0") [--db <path>] print
  $(basename "$0") [--db <path>] inc
  $(basename "$0") [--db <path>] dec
  $(basename "$0") [--db <path>] set <N>

Options:
  --db <path>   Override path to SQLite DB (default: "$DEFAULT_DB_PATH")

Commands:
  print         Print current PRAGMA user_version
  inc           Increment PRAGMA user_version by 1
  dec           Decrement PRAGMA user_version by 1 (not below 0)
  set <N>       Set PRAGMA user_version to integer N (>= 0)
EOF
}

require_sqlite3() {
  if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "Error: sqlite3 is not installed or not in PATH" >&2
    exit 1
  fi
}

ensure_db_exists() {
  if [ ! -f "$DB_PATH" ]; then
    echo "Error: DB file not found at: $DB_PATH" >&2
    echo "Hint: Launch the app once to create it, or pass --db to this script." >&2
    exit 1
  fi
}

get_user_version() {
  sqlite3 "$DB_PATH" "PRAGMA user_version;" | tr -d '\n'
}

set_user_version() {
  local new_version="$1"
  sqlite3 "$DB_PATH" "PRAGMA user_version = $new_version;" >/dev/null
}

# Parse optional --db
while [[ $# -gt 0 ]]; do
  case "$1" in
    --db)
      if [[ $# -lt 2 ]]; then
        echo "Error: --db requires a path argument" >&2
        exit 1
      fi
      DB_PATH="$2"
      shift 2
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      break
      ;;
  esac
done

if [[ $# -lt 1 ]]; then
  print_usage
  exit 1
fi

CMD="$1"
shift || true

require_sqlite3
ensure_db_exists

case "$CMD" in
  print)
    cur=$(get_user_version)
    echo "$cur"
    ;;
  inc)
    cur=$(get_user_version)
    if [[ -z "$cur" ]]; then cur=0; fi
    if ! [[ "$cur" =~ ^[0-9]+$ ]]; then
      echo "Error: current user_version is not an integer: '$cur'" >&2
      exit 1
    fi
    next=$((cur + 1))
    set_user_version "$next"
    echo "$next"
    ;;
  dec)
    cur=$(get_user_version)
    if [[ -z "$cur" ]]; then cur=0; fi
    if ! [[ "$cur" =~ ^[0-9]+$ ]]; then
      echo "Error: current user_version is not an integer: '$cur'" >&2
      exit 1
    fi
    if [[ "$cur" -gt 0 ]]; then
      next=$((cur - 1))
    else
      next=0
    fi
    set_user_version "$next"
    echo "$next"
    ;;
  set)
    if [[ $# -lt 1 ]]; then
      echo "Error: set requires a numeric value" >&2
      exit 1
    fi
    val="$1"
    if ! [[ "$val" =~ ^[0-9]+$ ]]; then
      echo "Error: value must be a non-negative integer" >&2
      exit 1
    fi
    set_user_version "$val"
    echo "$val"
    ;;
  *)
    echo "Error: unknown command '$CMD'" >&2
    print_usage
    exit 1
    ;;
esac


