# VORIXA Git Workflow & Codebase Protection

**Canonical ruleset for branching, pre-commit protection, pull requests, and merging.**
Binding on human contributors and AI agents alike. Referenced by `AGENTS.md` §6 and
`prompts/master_execution_prompt.md` §5.

---

## The One Rule

> **Nothing reaches `main` except through a pull request.**

No exceptions. Not for one-line fixes, not for typos, not for "just docs", and not because you are
the only person working on the repository. The audit trail and the CI gate are the point — a rule
with exceptions is not a rule, and the exception is always the commit that leaks the key.

---

## 1. Branches

### 1.1 Naming

```text
<type>/<scope>-<short-slug>
```

`<type>` must be one of:

| Type | Use for | Example |
| --- | --- | --- |
| `feat` | New player-facing or runtime capability | `feat/ui-inventory-grid` |
| `fix` | Bug fix | `fix/input-gamepad-deadzone` |
| `perf` | Performance work | `perf/render-vegetation-instancing` |
| `refactor` | Restructuring with no behavior change | `refactor/ecs-query-cache` |
| `docs` | Documentation only | `docs/adr-ui-layer-stack` |
| `test` | Tests only | `test/world-deterministic-seeds` |
| `build` | Build system, tooling, dependencies | `build/tailwind-v4` |
| `ci` | CI/CD configuration | `ci/activate-quality-gates` |
| `chore` | Maintenance | `chore/deps-september` |
| `release` | Release preparation | `release/v0.2.0` |

Rules:

* **Lowercase, hyphen-separated.** No underscores, no camelCase, no spaces.
* **Scope first, then slug** — so branches sort into meaningful groups.
* **Max ~50 characters.** If it doesn't fit, the branch is doing too much.
* Reference an issue when one exists: `feat/ui-inventory-grid-42`.

### 1.2 Creating one

Always branch from a freshly updated `main`:

```bash
git checkout main
git pull --ff-only origin main
git checkout -b feat/ui-inventory-grid
```

`--ff-only` is deliberate: if it fails, your local `main` has diverged, and you want to know that
*before* you start work rather than at merge time.

### 1.3 Lifetime

* **Short-lived.** Target under a week. A branch open longer than two weeks should be split.
* **One concern per branch.** If you discover unrelated work, branch again from `main`.
* **Rebase on `main` rather than merging `main` in**, to keep history linear:
  ```bash
  git fetch origin
  git rebase origin/main
  ```
* **Never rebase a branch someone else has based work on.**

### 1.4 `main` protection — currently UNAVAILABLE

> **⚠️ Status: not enforced server-side.** `akshaykumar33/VORIXA` is a **private repository on the
> GitHub Free plan**, where both the branch-protection API and the newer rulesets API return:
>
> ```text
> HTTP 403: Upgrade to GitHub Pro or make this repository public to enable this feature.
> ```
>
> Verified 2026-09-20 against both `/branches/main/protection` and `/rulesets`.
>
> **Consequence: `main` is directly pushable today, and the CI checks are advisory rather than
> required.** A red check does not currently stop a merge. The ruleset in
> `.github/branch-protection.json` is correct and ready — it simply cannot be applied yet.

#### Enabling it

Any one of these turns the authoritative gate on. This is the project owner's call:

| Option | Cost | Effect |
| --- | --- | --- |
| **Make the repository public** | Free | Full protection *and* rulesets unlock immediately. Natural fit for an open engine project; requires being comfortable developing in the open. |
| **GitHub Pro** | ~$4/month | Keeps the repository private and unlocks protection. |
| **Stay as-is** | Free | Hook + CI only. Honest, but `main` is unguarded server-side. |

Once the plan or visibility allows it, apply and verify:

```bash
gh api -X PUT repos/akshaykumar33/VORIXA/branches/main/protection \
  --input .github/branch-protection.json

gh api repos/akshaykumar33/VORIXA/branches/main/protection \
  --jq '.required_status_checks.contexts'
```

#### What the ruleset configures

* Require a pull request before merging
* Require status checks to pass: `Quality Gates`, `Engine Boundary`, `Secret Scan`
* Require branches to be up to date before merging
* Require conversation resolution before merging
* Require linear history
* Block force pushes and deletions

#### Until then

The local pre-commit hook **does** block commits on `main`, and it now works on every branch cut
from `main` because `.githooks/` is committed. That is real protection against the common mistake —
but it fails open (§2.5), so treat the PR discipline as a convention you are choosing to keep rather
than one the server is enforcing for you.

---

## 2. Protecting the Codebase Before Committing

### 2.1 What is enforced

A committed pre-commit hook runs on **staged content only** and **blocks the commit** when it finds:

| Check | Blocks on |
| --- | --- |
| Secret patterns | AWS keys, GitHub/GitLab/Slack/Stripe/OpenAI/Anthropic tokens, Google API keys, private key blocks, JWTs, bearer tokens, DB connection strings with inline credentials, generic `key/secret/token/password = "…"` assignments |
| Env files | Any real `.env*` file (`.env.example` is explicitly allowed) |
| Credential files | `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.keystore`, `id_rsa`, `*.crt` |
| Large files | Anything over 2 MB, which usually means an unoptimized asset |
| Merge artifacts | `<<<<<<<`, `=======`, `>>>>>>>` conflict markers |
| Debug leftovers | `debugger` statements |
| Commit message | Conventional Commits format, enforced by the `commit-msg` hook |

### 2.2 Activating the hooks

The hooks live in `.githooks/` and are version-controlled, so every clone gets the same protection.
Git does not enable them automatically — run once per clone:

```bash
pnpm hooks:install
```

This sets `core.hooksPath=.githooks`. Verify with `git config core.hooksPath`.

### 2.3 Running the scan manually

```bash
pnpm verify:secrets        # staged changes (what the hook runs)
pnpm verify:secrets --all  # every tracked file in the repository
pnpm verify                # secrets + typecheck + tests — the full local gate
```

### 2.4 The escape hatch

If the scanner produces a genuine false positive:

```bash
git commit --no-verify
```

**Using this obliges you to:**

1. Confirm by eye that the flagged content is genuinely not a secret.
2. Say so in the PR description, naming what was flagged and why it is safe.
3. Add a narrowing pattern or an allowlist entry to `scripts/verify-secrets.mjs` in the same PR, so
   the next person is not blocked by the same false positive.

CI re-runs the same scan on every PR, so `--no-verify` cannot get a secret to `main` — it only
defers the conversation to review.

### 2.5 What the hook does *not* protect you from

The pre-commit hook **fails open**. It silently does nothing when:

* `pnpm hooks:install` has never been run in this clone — git does not enable `core.hooksPath` by itself.
* `.githooks/` is not present in the current checkout — git skips a hook path that does not exist,
  with no warning. This bites when you check out a branch or tag predating the hooks.
* `--no-verify` is passed.
* A GUI client or IDE commits through a path that ignores hooks.

This is a property of git, not a bug to be fixed here. It is why the layering matters:

| Layer | Catches | Status today |
| --- | --- | --- |
| Pre-commit hook | Mistakes, instantly, before they enter history | **Active** — but fails open (absent hooks are skipped silently) |
| CI `Secret Scan` | Anything that reached a PR, scanning full history | **Active** — but advisory: a red check cannot block a merge without branch protection |
| Branch protection | Direct pushes and force-pushes to `main` | **Unavailable** — free plan + private repo (§1.4) |

**Never treat a green pre-commit as proof of anything.** It is a convenience.

**And note that no layer currently fails closed.** Until §1.4 is resolved, every control here is
advisory. The discipline holds because you choose to keep it, not because the server enforces it.
Read your own diffs.

### 2.6 If a secret is already committed

Treat it as **disclosed the moment it was written to disk**, regardless of push status.

1. **Revoke and rotate the credential first.** Before touching git history. Always.
2. If it is unpushed and in the last commit only: `git reset --soft HEAD~1`, remove it, recommit.
3. If it is pushed or deeper in history, the history must be rewritten
   (`git filter-repo --invert-paths --path <file>`) — a force-push to a protected branch requiring
   temporary protection removal. **Stop and ask the project owner before doing this.**
4. Record the incident per `docs/operations/INCIDENT_RESPONSE.md`.

Rotation is not optional because history was rewritten. Assume anything pushed was scraped.

---

## 3. Commits

Conventional Commits v1.0.0, enforced by the `commit-msg` hook:

```text
<type>(<scope>): <lowercase imperative description>
```

* **Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`,
  `revert`
* **Scopes:** `repo`, `engine`, `render`, `ecs`, `input`, `audio`, `world`, `ui`, `ux`, `adr`,
  `vision`, `ci`, `test`, `deps`, `security`
* **Subject:** lowercase, imperative mood, no trailing period, ≤72 characters
* **Breaking changes:** append `!` (`feat(ecs)!: …`) and add a `BREAKING CHANGE:` footer

Good:

```text
feat(ui): add inventory grid with keyboard navigation
fix(input): correct gamepad deadzone on axis release
perf(render): batch vegetation instances into single draw call
docs(adr): record ui layer stack decision
```

Rejected:

```text
update          changes         stuff          fix
final           final2          working        wip
```

Commits must be **atomic** — one coherent change, independently reviewable, ideally independently
buildable.

### 3.1 No AI attribution

The owner's rule, for every commit, pull request, tag and release, in this repository and every
other: **the author is the owner, and nothing says otherwise.** No `Co-Authored-By` trailer naming
an AI or a bot's address, no session links (`Claude-Session:` or similar), no "Generated with …" or
"🤖" lines, and no author or committer set to an AI. This holds whatever tool writes the commit and
whatever that tool's own defaults are. The `commit-msg` hook rejects such lines.

---

## 4. Pull Requests

### 4.1 Raising one

```bash
pnpm verify                      # gate locally before you ask CI
git push -u origin feat/ui-inventory-grid
gh pr create --fill --base main
```

### 4.2 Requirements

Every PR must:

* Use `.github/PULL_REQUEST_TEMPLATE.md` **completely** — unchecked boxes mean not ready.
* Have a title in Conventional Commit format (it becomes the squash-merge commit subject).
* **Attach a screenshot, GIF, or video for any visual change.** Non-negotiable given that UI/UX is
  an acceptance criterion. Include mobile width when the surface is responsive.
* Report measured numbers for any performance claim, naming browser and device.
* Link its issue or roadmap phase.
* State its security impact, and explicitly confirm no secrets were introduced.
* Be reviewable — under ~400 changed lines where at all possible. Split larger work.

### 4.3 Draft PRs

Open a draft early for feedback on direction. Drafts skip the completeness bar but still run CI.

```bash
gh pr create --draft
gh pr ready    # when it's done
```

---

## 5. Merging

### 5.1 Requirements

A PR may merge when **all** of these hold:

* [ ] `Quality Gates` green — typecheck, tests, build
* [ ] `Engine Boundary` green — engine core imports no UI framework
* [ ] `Secret Scan` green
* [ ] PR template fully completed
* [ ] Screenshot attached for visual changes
* [ ] All review conversations resolved
* [ ] Branch up to date with `main`
* [ ] Definition of Done in `master_execution_prompt.md` §3 satisfied

> These are **your** checklist, not the server's — branch protection is unavailable (§1.4), so
> GitHub will happily let you merge a PR with red checks. Look at the checks before you click.

### 5.2 Who may merge

**Current policy — solo maintainer.** The author may self-approve and merge once all required
checks pass. The PR and its green checks are the control; a second human is not currently available
and a rule requiring one would simply be bypassed.

**When a second maintainer joins,** this becomes: one approving review from someone other than the
author, required. Update the branch protection ruleset at that point.

AI agents **never** merge autonomously. An agent may open a PR, push to it, and report that it is
ready — the merge is a human action.

### 5.3 How to merge

**Squash merge, always.**

```bash
gh pr merge --squash
```

Rationale: branch-level commits are working notes; `main` should read as one clean, revertible
commit per change. Merge commits and rebase-merges are disabled on this repository.

Clean up afterward:

```bash
git checkout main
git pull --ff-only origin main
git remote prune origin
```

### 5.4 Reverting

```bash
gh pr revert <number>    # or: git revert <squashed-sha>
```

Revert first, diagnose second. A broken `main` is fixed by returning to green, not by rushing a
forward fix through the gate.

---

## 6. Releases

```bash
git checkout -b release/v0.2.0
# update CHANGELOG.md and package.json version
gh pr create --base main --title "release: v0.2.0"
# after merge:
git tag -a v0.2.0 -m "VORIXA v0.2.0"
git push origin v0.2.0
```

`CHANGELOG.md` follows Keep a Changelog; versioning follows SemVer. See
`docs/operations/RELEASES.md`.

---

## 7. Dependabot

Dependabot PRs follow the same gate — they are not special. Review the changelog of the bumped
package, confirm CI is green, squash merge. Batch related updates when several are open.

For major version bumps that cross an architectural boundary (a renderer, the UI framework, the test
runner), an ADR is required before merging.

---

## Quick Reference

```bash
# start
git checkout main && git pull --ff-only origin main
git checkout -b feat/ui-inventory-grid

# work
git add -p
git commit -m "feat(ui): add inventory grid with keyboard navigation"

# gate locally
pnpm verify

# ship
git push -u origin feat/ui-inventory-grid
gh pr create --fill --base main

# merge (after checks are green)
gh pr merge --squash
git checkout main && git pull --ff-only origin main
```
