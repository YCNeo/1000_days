# 1000 Days – Love Story Site Framework (Public Template)

> **This is the *public, open-source* framework** for a milestone / anniversary storytelling site that supports:
>
> - JSON-driven content (text + image pairs)
> - Quiz-based \"unlock\" (blurred sections, answer to reveal)
> - Mobile-friendly alternating layout (Text → Image pattern)
> - Theme cycling (light & dark variants)
> - Lightbox image viewer
> - GitHub Actions CI/CD (demo / production)
>
> **⚠️ No private content lives in this repo.** Real personal stories, card text, and photos are *injected at deploy time* from a **private content repository**.

---

## Table of Contents
- [1000 Days – Love Story Site Framework (Public Template)](#1000-days--love-story-site-framework-public-template)
  - [Table of Contents](#table-of-contents)
  - [Architecture Overview](#architecture-overview)
  - [Repo Roles: Public vs Private](#repo-roles-public-vs-private)
  - [Getting Started (Local Demo)](#getting-started-local-demo)
  - [Content Model](#content-model)
  - [Quiz Unlock Behavior](#quiz-unlock-behavior)
  - [Themes](#themes)
  - [Build \& Deploy Pipelines](#build--deploy-pipelines)
    - [Demo Build (sample content)](#demo-build-sample-content)
    - [Prod Build (inject private content)](#prod-build-inject-private-content)
  - [Secrets Required for Production Deploy](#secrets-required-for-production-deploy)
  - [Preventing Accidental Leaks](#preventing-accidental-leaks)
  - [License](#license)
  - [Credits / Inspiration](#credits--inspiration)

---

## Architecture Overview

```
site/
├─ index.html # framework UI
├─ card.html # deployment-time injected (small card page) – sample in repo
├─ style.css
├─ script.js
├─ content.json # generated at build time: real or sample
├─ content.sample.json# safe demo data (in repo)
├─ card.sample.html # safe demo card (in repo)
└─ assets/
    └─ img/
        └─ sample-*.jpg # non-sensitive demo images
```

Core JS loads `content.json`, builds sections, applies quiz locks, and enforces a time-to-live (TTL) for unlocked content (default 15 min, configurable).

---

## Repo Roles: Public vs Private

| Type            | Repo                              | Includes                              | Public? | Used For                              |
| --------------- | --------------------------------- | ------------------------------------- | ------- | ------------------------------------- |
| Framework       | `YCNeo/1000-days`                 | Code, sample content                  | ✅       | Open source template; community forks |
| Private Content | `YCNeo/1000-days-private-content` | Real text, card, images, quiz answers | ❌       | Injected at production deploy         |

---

## Getting Started (Local Demo)

```bash
git clone https://github.com/YCNeo/1000-days.git
cd 1000-days

# copy sample content
cp site/content.sample.json site/content.json
cp site/card.sample.html site/card.html

# start a quick static server (python)
python -m http.server 4000 -d site
# open http://localhost:4000/
```

---

## Content Model
content.json schema (simplified):

```json
{
  "meta": {
    "version": 1,
    "lock_duration_minutes": 15
  },
  "sections": [
    {
      "id": "start",
      "locked": true,
      "title": "Section Title",
      "paragraphs": ["Paragraph 1", "Paragraph 2"],
      "image": {
        "thumb": "assets/img/start.jpg",
        "full": "assets/img/start.jpg",
        "alt": "Alt text"
      },
      "quiz": {
        "question": "Question?",
        "options": ["A","B","C"],
        "answer_index": 0
      }
    }
  ]
}
```

---

## Quiz Unlock Behavior
- Locked sections are blurred + padlock overlay.
- Click to answer a multiple-choice question.
- Correct → unlock; wrong → retry.
- Unlock state cached in `localStorage` per section; TTL refreshes on interaction (default 15m).
- "Review" button (?) shows last answered question; optional re-take.

---

## Themes
Cycling button (top-right). CSS variables handle color palettes for:

- `light`
- `nightpink`
- `starry`
- `candle`

Developers: extend by adding `[data-theme=\"foo\"]` var sets in `style.css`.

---

## Build & Deploy Pipelines
Two GitHub Actions workflows are provided:

### Demo Build (sample content)
Runs on pushes + PRs. Uses sample text/images from this repo. Deploys to GitHub Pages preview environment (no custom domain, no private data).

### Prod Build (inject private content)
Triggered manually (workflow_dispatch) or on tagged release. Steps:

1. Checkout public repo.
2. Checkout private content repo using a token (read-only).
3. Copy private content.json, card.html, and all images into site/.
4. (Optional) Create CNAME for custom domain (e.g., 1000days.neoycn.xyz)
5. Upload & deploy to GitHub Pages production environment.

---

## Secrets Required for Production Deploy

| Secret                        | Used In             | Description                                                                             |
| ----------------------------- | ------------------- | --------------------------------------------------------------------------------------- |
| `PRIVATE_CONTENT_PAT`         | prod.yml            | Fine-grained personal access token w/ read access to `YCNeo/1000-days-private-content`. |
| `PAGES_DEPLOY_KEY` (optional) | if using deploy key | Alternative to PAT.                                                                     |

---

## Preventing Accidental Leaks
The repo includes:

- `.gitignore` ignoring `site/content.json` & most of `site/assets/img/`.

- `scripts/check-no-private.sh` CI step fails build if sensitive files/strings appear.

- Sample content only.

If you ever committed private files, follow the history scrub instructions in the Private Repo README or see `docs/cleanup-history.md` (to add).

---

## License
Source code & template assets: **MIT License**.
Sample content/images: **CC0 / public domain placeholders** (safe to reuse).
See [LICENSE](./LICENSE) for details.

---

## Credits / Inspiration
Created by Neo Pan for a 1000-day anniversary project. 💖
Open-sourced so others can create meaningful storytelling sites safely.