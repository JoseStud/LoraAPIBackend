Syncing this project to a new remote repository

This file documents a safe, repeatable process to push this codebase to a new
remote repository (GitHub, GitLab, etc.).

1) Create a remote repository
- On GitHub: create a new repo (private or public) via the web UI.
- Or with the GitHub CLI:

  gh repo create <owner>/<repo> --private --source=. --remote=origin --push

2) Run the helper script (recommended)

- Make the script executable and run it with the remote URL (HTTPS or SSH):

```bash
chmod +x scripts/sync_to_remote.sh
./scripts/sync_to_remote.sh git@github.com:youruser/your-repo.git main
```

- The script will:
  - run `git init` if the folder is not already a repo
  - add a default `.gitignore` if missing
  - create an initial commit (if none exists)
  - configure `origin` remote and push the chosen branch (default: `main`)

3) Post-push checklist
- Add repository secrets (S3 credentials, DATABASE_URL, REDIS_URL) in the remote provider (GitHub Settings > Secrets) for CI/workers.
- Enable CI (GitHub Actions) if desired. Use `pyproject.toml` / `dev-requirements.txt` to install test/lint deps in CI.
- Optionally add a `CODEOWNERS` or branch protection rules.

4) If you prefer manual commands

```bash
git init
git add --all
git commit -m "chore: initial commit"
git remote add origin git@github.com:youruser/your-repo.git
git branch -M main
git push -u origin main
```

Notes
- The script assumes you have appropriate credentials set up for the remote (SSH keys or HTTPS tokens).
- If you want the repo to include a Github Actions workflow for tests/linting, tell me and I will scaffold a minimal `.github/workflows/ci.yml`.

