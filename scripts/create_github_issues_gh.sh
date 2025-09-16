#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Create GitHub issues from docs/issues/*.md using GitHub CLI (gh)

Usage:
  bash scripts/create_github_issues_gh.sh \
    --repo <owner/repo> [--labels label1,label2] [--issues-dir path] [--dry-run]

Notes:
  - Requires: gh (authenticated) and jq
  - Skips docs/issues/README.md
  - Title = first Markdown h1 line (# ...); fallback to filename
  - Labels: always includes 'frontend'; adds 'fetch-consolidation' for FE-00x and 'vue-islands' for FE-10x
USAGE
}

repo=""
issues_dir="docs/issues"
extra_labels=""
dry_run=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) repo=${2:-}; shift 2;;
    --repo=*) repo=${1#*=}; shift;;
    --labels) extra_labels=${2:-}; shift 2;;
    --labels=*) extra_labels=${1#*=}; shift;;
    --issues-dir|--dir) issues_dir=${2:-}; shift 2;;
    --issues-dir=*|--dir=*) issues_dir=${1#*=}; shift;;
    --dry-run) dry_run=1; shift;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh CLI is required (https://cli.github.com/)" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required" >&2
  exit 1
fi

if [[ -z "$repo" ]]; then
  echo "Error: --repo <owner/repo> is required" >&2
  usage
  exit 1
fi

# Verify auth
if ! gh auth status >/dev/null 2>&1; then
  echo "Error: gh is not authenticated. Run 'gh auth login' first." >&2
  exit 1
fi

if [[ ! -d "$issues_dir" ]]; then
  echo "Error: issues directory not found: $issues_dir" >&2
  exit 1
fi

shopt -s nullglob
files=("$issues_dir"/*.md)
echo "Found ${#files[@]} file(s) under $issues_dir"

created=0
skipped=0

for file in "${files[@]}"; do
  base=$(basename "$file")
  # Skip README
  if [[ "${base,,}" == "readme.md" ]]; then
    continue
  fi

  # Derive title from first h1, fallback to filename
  title=$(grep -m1 '^#\s\+' "$file" | sed -E 's/^#\s+//; s/[[:space:]]+$//' || true)
  if [[ -z "$title" ]]; then
    title=${base%.md}
  fi

  # Build labels
  labels=("frontend")
  if [[ $base =~ ^FE-00[0-9]+ ]]; then labels+=("fetch-consolidation"); fi
  if [[ $base =~ ^FE-10[0-9]+ ]]; then labels+=("vue-islands"); fi
  if [[ -n "$extra_labels" ]]; then
    IFS=',' read -r -a extra_arr <<< "$extra_labels"
    for l in "${extra_arr[@]}"; do
      [[ -n "$l" ]] && labels+=("$l")
    done
  fi

  # Check if an issue with the same title exists (open/closed)
  existing=$(gh issue list --repo "$repo" --state all --search "in:title \"$title\"" --json title --limit 1 | jq -r '.[0].title // empty')
  if [[ -n "$existing" ]]; then
    echo "Skip (exists): $title"
    skipped=$((skipped+1))
    continue
  fi

  # Build label flags
  label_flags=()
  for l in "${labels[@]}"; do
    label_flags+=("-l" "$l")
  done

  if (( dry_run == 1 )); then
    echo "[dry-run] Would create: '$title' from $base with labels $(IFS=,; echo "${labels[*]}")"
    continue
  fi

  # Create issue
  if gh issue create --repo "$repo" --title "$title" --body-file "$file" "${label_flags[@]}" >/tmp/gh_issue_out.$$ 2>&1; then
    url=$(grep -Eo 'https://github.com/[^ ]+/issues/[0-9]+' /tmp/gh_issue_out.$$ | tail -n1 || true)
    echo "Created: $title${url:+ -> $url}"
    created=$((created+1))
  else
    # Retry without labels if label missing
    if grep -qi "label: .*not found\|could not add label" /tmp/gh_issue_out.$$; then
      echo "Warn: labels not found for '$title'. Retrying without labels..."
      if gh issue create --repo "$repo" --title "$title" --body-file "$file" >/tmp/gh_issue_out.$$ 2>&1; then
        url=$(grep -Eo 'https://github.com/[^ ]+/issues/[0-9]+' /tmp/gh_issue_out.$$ | tail -n1 || true)
        echo "Created (no labels): $title${url:+ -> $url}"
        created=$((created+1))
      else
        echo "Error creating issue from $base (no labels retry):" >&2
        cat /tmp/gh_issue_out.$$ >&2 || true
      fi
    else
      echo "Error creating issue from $base:" >&2
      cat /tmp/gh_issue_out.$$ >&2 || true
    fi
  fi
  rm -f /tmp/gh_issue_out.$$ || true
done

echo "Done. Created $created issue(s), skipped $skipped."
