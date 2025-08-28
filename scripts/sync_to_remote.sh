#!/usr/bin/env bash
# Helper to initialize a git repo (if needed), commit current tree and push to a remote.
# Usage: ./scripts/sync_to_remote.sh <remote_url> [branch]

set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_URL="$1"
BRANCH="${2:-main}"

if [ -z "$REMOTE_URL" ]; then
  echo "Usage: $0 <remote_url> [branch]"
  exit 2
fi

cd "$ROOT_DIR"

if [ ! -d .git ]; then
  echo "Initializing new git repository..."
  git init
fi

# Ensure .gitignore is present
if [ ! -f .gitignore ]; then
  echo ".gitignore is missing, creating default .gitignore"
  cat > .gitignore <<'EOF'
# minimal .gitignore
.venv/
__pycache__/
db.sqlite
.env
EOF
fi

# Add all files and create an initial commit if none exist
if git rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "Repository already has commits. Creating a new commit with current changes."
else
  echo "Creating initial commit"
  git add --all
  git commit -m "chore: initial commit"
fi

# If remote exists, update it; otherwise add
if git remote | grep -q origin; then
  git remote remove origin || true
fi

git remote add origin "$REMOTE_URL"

# Create branch locally if needed
if git show-ref --verify --quiet refs/heads/$BRANCH; then
  echo "Branch $BRANCH already exists locally"
else
  git checkout -b $BRANCH
fi

# Push
echo "Pushing to ${REMOTE_URL} (${BRANCH})..."
git push -u origin $BRANCH

echo "Done."
