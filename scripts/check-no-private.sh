#!/usr/bin/env bash
#
# Privacy guard for the PUBLIC repo.
# Fails CI if private content appears in tracked source files that ship to the site.
#
# Usage:
#   run: bash scripts/check-no-private.sh
#
# Env overrides:
#   CHECK_ALLOW_SENSITIVE=1  -> skip string scans (file checks still run)
#   CHECK_EXTRA_PATTERNS="foo|bar" -> add regex to search
#
set -euo pipefail

echo "[check-no-private] scanning for sensitive files..."

# ------------------------------------------------------------------
# 1. ensure forbidden tracked files (public repo must not contain these)
# ------------------------------------------------------------------
if git ls-files --error-unmatch site/content.json >/dev/null 2>&1; then
  echo "::error::site/content.json is tracked! This file must NOT be committed in the public repo."
  exit 1
fi
if git ls-files --error-unmatch site/card.html >/dev/null 2>&1; then
  echo "::error::site/card.html is tracked! This file must NOT be committed in the public repo."
  exit 1
fi

# ------------------------------------------------------------------
# 2. ensure no non-sample images tracked
# ------------------------------------------------------------------
tracked_imgs="$(git ls-files 'site/assets/img' || true)"
if [[ -n "$tracked_imgs" ]]; then
  # allow sample-* and .gitkeep
  non_sample=$(echo "$tracked_imgs" | grep -Ev '^site/assets/img/(sample-|\.gitkeep$)' || true)
  if [[ -n "$non_sample" ]]; then
    echo "::error::Non-sample images are tracked in public repo (privacy risk):"
    echo "$non_sample"
    exit 1
  fi
fi

# ------------------------------------------------------------------
# 3. sensitive string scan (optional)
#    *只掃部署會帶出的 site/ 內檔案*
#    *排除 sample 檔*
# ------------------------------------------------------------------
if [[ "${CHECK_ALLOW_SENSITIVE:-0}" != "1" ]]; then
  # 基本敏感字串：交往起始日、你的中文名
  SENSITIVE_PATTERNS=('2022-10-23' '煜智')

  # 若 workflow 傳入額外 pattern，可追加
  if [[ -n "${CHECK_EXTRA_PATTERNS:-}" ]]; then
    IFS='|' read -ra EXTRA <<<"$CHECK_EXTRA_PATTERNS"
    SENSITIVE_PATTERNS+=("${EXTRA[@]}")
  fi

  # git grep 路徑限制
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
else
  echo "[check-no-private] string scan skipped (CHECK_ALLOW_SENSITIVE=1)."
fi

echo "[check-no-private] OK (no private tracked files detected)."
exit 0
