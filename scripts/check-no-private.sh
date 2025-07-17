#!/usr/bin/env bash
#
# Privacy guard for the PUBLIC repo.
# Fails CI if private content appears in tracked source files that ship to the site.
#
# Usage (in workflows):
#   run: bash scripts/check-no-private.sh
#
# Env overrides:
#   CHECK_SCOPE=all        # (default) scan site/ only
#   CHECK_ALLOW_SENSITIVE=1# skip sensitive string scan (useful temporarily)

set -euo pipefail

echo "[check-no-private] scanning for sensitive files..."

# ------------------------------------------------------------------
# 1. ensure real content/card not tracked in public repo
# ------------------------------------------------------------------
if git ls-files --error-unmatch site/content.json >/dev/null 2>&1; then
  echo "::error::site/content.json is tracked! This should never be committed in the public repo."
  exit 1
fi
if git ls-files --error-unmatch site/card.html >/dev/null 2>&1; then
  echo "::error::site/card.html is tracked! This should never be committed in the public repo."
  exit 1
fi

# ------------------------------------------------------------------
# 2. ensure no non-sample images tracked
# ------------------------------------------------------------------
tracked_imgs="$(git ls-files 'site/assets/img' || true)"
if [[ -n "$tracked_imgs" ]]; then
  # filter allowed sample patterns
  non_sample=$(echo "$tracked_imgs" | grep -Ev '^site/assets/img/(sample-|\\.gitkeep$)' || true)
  if [[ -n "$non_sample" ]]; then
    echo "::error::Non-sample images are tracked in public repo (privacy risk):"
    echo "$non_sample"
    exit 1
  fi
fi

# ------------------------------------------------------------------
# 3. sensitive string scan (site/ only, exclude sample files)
# ------------------------------------------------------------------
if [[ "${CHECK_ALLOW_SENSITIVE:-0}" != "1" ]]; then
  SENSITIVE_PATTERNS=('2022-10-23' '煜智' '1000日' '千日')
  # Only scan deployable files; exclude known sample placeholders
  GIT_GREP_PATHS=(
    'site/'
    ':!site/content.sample.json'
    ':!site/card.sample.html'
  )

  found=0
  for pat in "${SENSITIVE_PATTERNS[@]}"; do
    if git grep -n -- "${pat}" -- "${GIT_GREP_PATHS[@]}" >/tmp/priv-grep.$$ 2>/dev/null; then
      echo "::error::Sensitive token \"${pat}\" found in public source:"
      cat /tmp/priv-grep.$$
      found=1
    fi
  done
  rm -f /tmp/priv-grep.$$ || true

  if [[ $found -ne 0 ]]; then
    echo "::error::Possible private content detected in source."
    exit 1
  fi
fi

echo "[check-no-private] OK (no private tracked files detected)."
exit 0
