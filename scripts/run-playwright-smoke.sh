#!/usr/bin/env bash
# Helper to prepare and run the Playwright smoke test across different OSes.
# Usage:
#   chmod +x scripts/run-playwright-smoke.sh
#   ./scripts/run-playwright-smoke.sh
# It will attempt to install dependencies for Debian/Ubuntu (apt), or Arch (pacman).
# If the host isn't supported or you prefer isolation, it will run tests inside the Playwright Docker image.

set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SMOKE_TEST="tests/e2e/smoke-loading.spec.js"
BASE_URL=${BASE_URL:-http://host.docker.internal:8000}

echo "Detected OS: $(uname -srv)"

# Read /etc/os-release if available
OS_ID=""
OS_ID_LIKE=""
if [[ -f /etc/os-release ]]; then
  OS_ID=$(awk -F= '/^ID=/{print $2}' /etc/os-release | tr -d '"') || true
  OS_ID_LIKE=$(awk -F= '/^ID_LIKE=/{print $2}' /etc/os-release | tr -d '"') || true
fi

install_for_debian() {
  echo "Installing Playwright runtime deps for Ubuntu/Debian via apt (requires sudo)"
  sudo -- sh -c "apt-get update && apt-get install -y --no-install-recommends \
    fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 libegl1 libgbm1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libxshmfence1 ffmpeg libcairo-gobject2 libdbus-glib-1-2 libfontconfig1 libfreetype6 libgdk-pixbuf2.0-0 libpangocairo-1.0-0 libpangoft2-1.0-0 libxcb-shm0 libxcursor1 libxi6 libxrender1 libxt6 libxtst6 libenchant-2-2 libflite1 libx264-155 libenchant1c2a libepoxy0 libevdev2 libgl1 libgles2 libgudev-1.0-0 libharfbuzz-icu0 libharfbuzz0b libhyphen0 libicu66 libjpeg-turbo8 libnghttp2-14 libnotify4 libopengl0 libopenjp2-7 libopus0 libpng16-16 libsecret-1-0 libvpx6 libwayland-client0 libwayland-egl1 libwayland-server0 libwebp6 libwebpdemux2 libwoff1 libxkbcommon0 libxml2 libxslt1.1 libatomic1 libevent-2.1-7 xvfb fonts-noto-color-emoji ttf-unifont libfontconfig xfonts-cyrillic xfonts-scalable fonts-ipafont-gothic fonts-wqy-zenhei fonts-tlwg-loma-otf ttf-ubuntu-font-family"
}

install_for_arch() {
  echo "Installing Playwright runtime deps for Arch via pacman (requires sudo)"
  sudo pacman -Syu --noconfirm
  sudo pacman -S --needed --noconfirm \
    libx11 libxrandr libxss libxcursor libxcomposite libxdamage libxext \
    gcc libgcc alsa-lib cups libdrm libglvnd nss libxkbcommon \
    gtk3 glib2 libwayland libxrender libxfixes libxi pango \
    harfbuzz fontconfig ttf-dejavu ffmpeg libxss
}

run_playwright_locally() {
  echo "Installing Playwright test runner and browsers locally (npm required)"
  cd "$ROOT_DIR"
  npm i -D @playwright/test
  npx playwright install --with-deps
  echo "Running smoke test against BASE_URL=${BASE_URL}"
  BASE_URL=${BASE_URL} npx playwright test "$SMOKE_TEST" --project=chromium
}

run_playwright_docker() {
  echo "Running Playwright smoke test inside official Playwright Docker image"
  docker run --rm -it \
    -v "$ROOT_DIR":/work -w /work \
    -e BASE_URL="$BASE_URL" \
    mcr.microsoft.com/playwright:v1.35.0-focal /bin/bash -lc "npm ci || npm i && npx playwright test $SMOKE_TEST --project=chromium"
}

# Main decision
case "${OS_ID:-}${OS_ID_LIKE:-}" in
  *arch*|*manjaro*)
    echo "Detected Arch-like system. Attempting pacman install."
    install_for_arch || { echo "pacman install failed — falling back to Docker"; run_playwright_docker; exit 1; }
    run_playwright_locally || { echo "Local run failed — falling back to Docker"; run_playwright_docker; exit 1; }
    ;;
  *debian*|*ubuntu*|ubuntu|debian)
    echo "Detected Debian/Ubuntu-like system. Attempting apt install."
    install_for_debian || { echo "apt install failed — falling back to Docker"; run_playwright_docker; exit 1; }
    run_playwright_locally || { echo "Local run failed — falling back to Docker"; run_playwright_docker; exit 1; }
    ;;
  *)
    echo "Unrecognized or unsupported host OS. Using Docker fallback."
    run_playwright_docker
    ;;
esac
