#!/usr/bin/env bash
set -euo pipefail

# Generic one-way sync into a target git repo.
#
# Usage:
#   ./sync.sh /path/to/source /path/to/target-git-repo
# Test comment 1
# Test comment 1
# Test comment 1
# Test comment 4
# Test comment 4
# Test comment 4
# Test comment 4

SRC="${1:-}"
DST="${2:-}"

if [[ -z "$SRC" || -z "$DST" ]]; then
  echo "USAGE: $0 /path/to/source /path/to/target-git-repo" >&2
  exit 2
fi

# Expand ~ (best effort)
SRC="${SRC/#\~/$HOME}"
DST="${DST/#\~/$HOME}"

# ---- Safety checks ----
if [[ ! -d "$SRC" ]]; then
  echo "ERROR: Source folder not found: $SRC" >&2
  exit 1
fi

if [[ ! -d "$DST" ]]; then
  echo "ERROR: Destination folder not found: $DST" >&2
  exit 1
fi

if [[ ! -d "$DST/.git" ]]; then
  echo "ERROR: Destination is not a git repo (missing .git): $DST" >&2
  exit 1
fi

if [[ "$SRC" == "/" || "$DST" == "/" ]]; then
  echo "ERROR: Refusing to sync from/to '/'" >&2
  exit 1
fi

# ---- Excludes (edit to taste) ----
EXCLUDES=(
  ".git/"
  "node_modules/"
  ".DS_Store"
  "Thumbs.db"

  # common build/cache outputs (safe to regenerate; avoids noise)
  ".next/"
  "dist/"
  "build/"
  "out/"
  ".cache/"
  ".vite/"
  ".turbo/"
  ".parcel-cache/"

  # python venv/caches if present
  ".venv/"
  "venv/"
  "__pycache__/"
  "*.pyc"

  # logs
  "*.log"

  # secrets
  ".env"
  ".env.*"
)

RSYNC_ARGS=(-av --delete --human-readable --itemize-changes)
for ex in "${EXCLUDES[@]}"; do
  RSYNC_ARGS+=(--exclude "$ex")
done

echo "Sync plan:"
echo "  FROM: $SRC/"
echo "    TO: $DST/"
echo

echo "== Dry run (preview) =="
rsync "${RSYNC_ARGS[@]}" --dry-run "$SRC/" "$DST/" | sed 's/^/  /'
echo

read -r -p "Proceed with sync (this will apply deletions)? (y/N) " yn
case "$yn" in
  [Yy]) ;;
  *) echo "Aborted."; exit 0 ;;
esac

echo
echo "== Syncing =="
rsync "${RSYNC_ARGS[@]}" "$SRC/" "$DST/"
echo
echo "Done."
echo
echo "Next:"
echo "  cd \"$DST\""
echo "  git status"
echo "  git diff"
