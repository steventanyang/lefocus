#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_DIR="$REPO_ROOT/src-tauri/src/db"
MIG_RS="$DB_DIR/migrations.rs"

if [[ ! -f "$MIG_RS" ]]; then
  echo "migrations.rs not found at $MIG_RS" >&2
  exit 1
fi

cd "$DB_DIR"

# Determine next migration version from existing schema_v*.sql files
current=$(ls schema_v*.sql 2>/dev/null | sed -E 's/.*schema_v([0-9]+)\.sql/\1/' | sort -n | tail -1)
if [[ -z "${current:-}" ]]; then
  current=0
fi
next=$((current + 1))
new_sql="$DB_DIR/schema_v${next}.sql"

if [[ -e "$new_sql" ]]; then
  echo "Migration file already exists: $new_sql" >&2
  exit 1
fi

# Create the new SQL template
cat > "$new_sql" <<EOF
-- Migration to version ${next}
-- Write SQL statements here; they run inside a single transaction.
-- Example:
-- ALTER TABLE sessions ADD COLUMN notes TEXT;
EOF

# Bump CURRENT_SCHEMA_VERSION in migrations.rs (BSD sed for macOS)
if grep -q '^const CURRENT_SCHEMA_VERSION: i32 = ' "$MIG_RS"; then
  sed -i '' -E "s/^(const CURRENT_SCHEMA_VERSION: i32 = )([0-9]+);/\1${next};/" "$MIG_RS"
else
  echo "Could not find CURRENT_SCHEMA_VERSION in $MIG_RS" >&2
  exit 1
fi

# Insert a new match arm for this version before the default `_ => bail!(...)` arm
tmp="$(mktemp)"
awk -v ver="$next" '
  BEGIN { inserted=0 }
  {
    if (inserted==0 && $0 ~ /^[[:space:]]*_ *=> *bail!\(/) {
      indent=$0
      sub(/[^ \t].*$/, "", indent)
      print indent ver " => {"
      print indent "    tx.execute_batch(include_str!(\"schema_v" ver ".sql\"))"
      print indent "        .context(\"failed to execute schema_v" ver ".sql\")?;"
      print indent "    Ok(())"
      print indent "}"
      print $0
      inserted=1
      next
    }
    print
  }
' "$MIG_RS" > "$tmp"

mv "$tmp" "$MIG_RS"

# Verify insertion
if ! grep -q "schema_v${next}\.sql" "$MIG_RS"; then
  echo "Failed to insert migration arm into $MIG_RS" >&2
  exit 1
fi

echo "Created $new_sql"
echo "Bumped CURRENT_SCHEMA_VERSION to $next and added migration arm in $MIG_RS"


