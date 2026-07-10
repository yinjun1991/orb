# orbc

A CLI tool that orchestrates AI agents across a full development pipeline — from issue to merged code.

It manages a multi-repo project around **issues**, with git worktrees for isolation, markdown documents for AI context, and automated review→fix loops.

## Quick start

```sh
npm install -g orbc

# In your project root:
orbc init                 # create .orb.yaml + install skills for Claude Code / Codex
orbc sync                 # pull latest code for all repos

orbc ic "Add 2FA"         # create issue f1
# → refine requirements in issues/f1/issue.md
# → design the solution:   /orb-architect

orbc code f1              # AI implements the code plan
orbc review f1            # automated review→fix loop
orbc pr f1                # push and create GitHub PR
orbc clean f1             # remove worktree
```

## Pipeline stages

```
[defining] → [designing] → [coding] → [reviewing] → [done]
    ↑             ↑           ↑            ↑           ↑
  external AI  external AI   orbc code   orbc review  orbc pr
                                                      orbc clean
```

| Stage | Who | How |
|---|---|---|
| **Defining** | You | Refine `issues/<id>/issue.md` until requirements are clear enough for design. |
| **Designing** | AI + you | Run `/orb-architect` to produce `tech_design.md` and `code_plan.md`. Review the output before proceeding. |
| **Coding** | orbc | `orbc code f1` — developer agent implements the code plan in an isolated worktree. |
| **Reviewing** | orbc | `orbc review f1` — automated loop: code-reviewer finds bugs → developer fixes → repeat until clean. |
| **PR** | orbc | `orbc pr f1` — push the issue branch and create a GitHub PR to the base branch. Merging is handled by GitHub. |
| **Clean up** | orbc | `orbc clean f1` — remove the worktree and mark the issue as done. |

## Commands

### `orbc init`

Initialize a project. Creates `.orb.yaml` and installs orb skills.

```sh
orbc init
```

`.orb.yaml` is auto-populated if a `repos/` directory exists:

```yaml
agent: cc
# coding_agent: cc      # agent for code command
# review_agent: cc      # agent for review command

repos:
  - path: ./repos/backend
    base_branch: main      # required
    remote: origin         # optional, defaults to origin
    # copy_files:           # untracked files to copy into worktrees
    #   - .env

max_review_rounds: 3
```

### `orbc install-skills`

Install orb's skills for Claude Code and Codex.

```sh
orbc install-skills           # install to project root
orbc install-skills --global  # install globally to ~/
```

### `orbc ic "title"`

Create a new issue. Assigns an ID (f1, f2, ...), creates worktrees from all repos, and scaffolds the issue directory with templates.

```sh
orbc ic "Add two-factor authentication"
```

### `orbc sync`

Pull the latest code for all repos on their base branches.

```sh
orbc sync
```

### `orbc status [issueId]`

Show project or issue status.

```sh
orbc status          # list all issues
orbc status f1       # show f1 detail + bug list
```

### `orbc code f1`

Run the developer agent to implement an issue from its code plan. The agent works in an isolated worktree. When it finishes, the issue stays at `coding` — you can inspect the result before review.

```sh
orbc code f1
```

### `orbc review f1`

Run the automated review→fix loop. The code-reviewer inspects the diff, files bugs, the developer fixes them, and the loop repeats until no bugs remain (or max rounds is reached).

```sh
orbc review f1
```

### `orbc block f1 <bugNums> [reason]`

Mark bugs as blocked to skip them in the review loop. Useful for deferring low-priority findings.

```sh
orbc block f1 3                          # block bug #3
orbc block f1 1,2 "not a real risk"      # block with reason
```

### `orbc pr f1`

Push the issue branch and create a GitHub PR to the base branch. Uses `gh` CLI — make sure you're authenticated (`gh auth login`).

```sh
orbc pr f1
```

Prints the PR URL for each repo. Merging is handled by GitHub, not orbc.

### `orbc clean f1`

Remove the worktree and mark the issue as done. Run this after the PR is merged.

```sh
orbc clean f1
```

## What orbc does NOT do

orbc handles phases where AI works autonomously (coding, review→fix loop). For phases that require human judgment and discussion, **use external AI tools directly**:

| Phase | Tool | Skill |
|---|---|---|
| Requirements discussion | Editor / Claude Code / Codex | Edit `issues/<id>/issue.md` |
| Technical design | Claude Code / Codex | `/orb-architect` |
| Coding (autonomous) | `orbc code f1` | — |
| Review loop (autonomous) | `orbc review f1` | — |

Start Claude Code or Codex in your project root. The agent skills are installed by `orbc init` to `.claude/skills/` and `.agents/skills/`, so `/orb-architect` works immediately.

## Project structure

```
project/
├── .orb.yaml                  # orb configuration
├── .claude/skills/            # skills for Claude Code
├── .agents/skills/            # skills for Codex
├── repos/                     # reference copies (read-only, on stable branches)
│   ├── backend/
│   │   └── docs/              # architecture docs for AI context
│   └── frontend/
│       └── docs/
├── worktrees/                 # isolated worktrees per issue
│   └── f1/
│       ├── backend/
│       └── frontend/
└── issues/
    ├── issues.md              # issue index (ID, title, status)
    └── f1/
        ├── issue.md           # requirements
        ├── tech_design.md     # technical design
        ├── code_plan.md       # implementation plan
        ├── base_version.json  # base commits for each repo
        ├── bugs.md            # bug index + status (single source of truth)
        └── bugs/              # bug description files
            ├── bug1.md
            └── bug2.md
```
