# Legacy repos (`out/`)

`out/` is **not tracked in this repository** (gitignored — see `.gitignore` and
`docs/development-history/phases/phase-0-foundation.md` for why: each is its own git repo, already
public, and embedding 5 nested `.git` dirs would be messy for no benefit). Anyone cloning this repo
fresh from GitHub needs to check them out separately before `docs/legacy-feature-inventory.md`'s
file references (e.g. `about/index.html`) resolve to anything real on disk.

## Getting them

```bash
mkdir -p out && cd out
git clone --depth 1 https://github.com/ajiboladev/aleemanschool-teacher-portal.git
git clone --depth 1 https://github.com/ajiboladev/aleemanschool-primary-teacher-portal.git
git clone --depth 1 https://github.com/ajiboladev/admin-aleemanschool-admin-portal..git admin-aleemanschool-admin-portal
git clone --depth 1 https://github.com/ajiboladev/admin-aleemanschool-primary-admin-portal.git
git clone --depth 1 https://github.com/ajiboladev/aleemanschool.git
```

Note the trailing period in `admin-aleemanschool-admin-portal.`'s actual GitHub name (`gh repo list
ajiboladev` is how this was originally discovered) — the clone command above renames it on checkout
to drop the period, matching the other four's naming convention.

| Local directory | Source |
| --- | --- |
| `aleemanschool-teacher-portal` | `github.com/ajiboladev/aleemanschool-teacher-portal` |
| `aleemanschool-primary-teacher-portal` | `github.com/ajiboladev/aleemanschool-primary-teacher-portal` |
| `admin-aleemanschool-admin-portal` | `github.com/ajiboladev/admin-aleemanschool-admin-portal.` (trailing period) |
| `admin-aleemanschool-primary-admin-portal` | `github.com/ajiboladev/admin-aleemanschool-primary-admin-portal` |
| `aleemanschool` | `github.com/ajiboladev/aleemanschool` |

All five are public. Read-only reference for migration — never modified, per the standing decision
not to patch the live legacy system (`docs/development-history/aleemaan_progress.md`).
