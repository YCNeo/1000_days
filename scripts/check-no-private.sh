#!/usr/bin/env bash
set -euo pipefail

echo "[check-no-private] scanning for sensitive files..."

# Fail if content.json exists in git history at HEAD
if git ls-files | grep -q '^site/content.json$'; then
  echo "::error::site/content.json is tracked! Remove & rewrite history before pushing public."
  exit 1
fi

# Fail if any non-sample images are tracked
tracked_private_imgs=$(git ls-files 'site/assets/img' | grep -v 'sample-' || true)
if [[ -n "$tracked_private_imgs" ]]; then
  echo "::warning::Detected tracked image files:"
  echo "$tracked_private_imgs"
  echo "::error::Only sample images should be tracked in public repo."
  exit 1
fi

# Basic sensitive string scan (edit as needed)
if grep -R "2022-10-23" -n || grep -R "煜智" -n || grep -R "1000日" -n; then
  echo "::error::Possible private content detected in source."
  exit 1
fi

echo "[check-no-private] OK"
