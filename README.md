# Etudes

A sprint coach for builders who have more ideas than shipped products.

Etudes interviews you about your project, skills, and patterns, then generates a 5-day sprint calibrated to how you actually work. It coaches you through the sprint with daily check-ins, pattern detection, and real-time accountability.

## What It Does

1. **Intake interview** — Asks about your project, work patterns, and available time. If you have code, it reads the repo. If you have a spec, it assesses scope. If you have nothing, it helps you pick a starting point.
2. **Pattern detection** — Identifies your specific avoidance patterns (overplanning, idea-hopping, scope creep, confidence gaps) and calibrates coaching style accordingly.
3. **Sprint generation** — Creates a 5-day sprint with concrete, time-estimated, checkbox tasks grounded in your actual codebase.
4. **Active coaching** — Daily check-ins that catch avoidance in real-time, capture new ideas without letting them derail you, and keep you focused on the next checkbox.
5. **Sprint retro** — Reviews what shipped, what was avoided, and what to change next time.

## What It Is Not

- **Not a project manager.** It doesn't track Jira tickets or integrate with your PM tools. It tracks one thing: did you ship.
- **Not a therapist.** It mirrors your patterns back to you. It doesn't diagnose or treat anything.
- **Not motivational.** No "you've got this!" or "amazing work!" If you respond better to encouragement, you can set that in intake. But the default is direct.
- **Not an AI coding assistant.** It doesn't write your code. It tells you what to build next, in what order, and calls you out when you're avoiding it.
- **Not a long-term planning tool.** It generates 5-day sprints. Not roadmaps, not quarterly plans, not OKRs. Five days. Checkboxes. Ship.

## Installation

### Via skills.sh (Recommended)

```bash
npx skills add keecraw/etudes
```

That's it. Works with Claude Code, Cursor, Windsurf, Cline, Codex, and 15+ other agents.

### Via GitHub (manual)

```bash
git clone https://github.com/keecraw/etudes.git /tmp/etudes && \
  mkdir -p .claude/skills/etudes .claude/commands && \
  cp /tmp/etudes/skills/etudes/SKILL.md .claude/skills/etudes/ && \
  cp /tmp/etudes/commands/*.md .claude/commands/ && \
  rm -rf /tmp/etudes
```

### Manual Setup (any Claude Code project)

If you don't want the full plugin, you can install just the pieces you need:

```bash
# Install the skill only
mkdir -p .claude/skills/etudes
cp skills/etudes/SKILL.md .claude/skills/etudes/SKILL.md

# Install the slash commands
cp commands/*.md .claude/commands/
```

### As a Claude Project (web UI)

If you want to use Etudes without Claude Code:

1. Create a new Claude Project at [claude.ai](https://claude.ai)
2. Paste the contents of `system-prompt.md` as the project's system prompt
3. Start a conversation

## Usage

### Start a new sprint

```
/etudes
```

Runs the full intake if this is your first time, or shows your sprint status if you already have one.

### Daily check-in

```
/etudes-checkin
```

Or with an update:

```
/etudes-checkin finished the header component, stuck on the auth flow
```

### Park an idea mid-sprint

```
/etudes-park what if I added a dark mode toggle
```

Captures the idea in `.etudes/parking-lot.md` without derailing your sprint.

### Sprint retrospective

```
/etudes-retro
```

Reviews what shipped, what was avoided, and generates the next sprint if you want one.

## How It Works

### Intake (first run)

Etudes asks ~8 questions, one at a time, conversationally. It also scans your repo for signals: git activity, README, tech stack, test coverage, deployment configs.

If you're torn between projects, it walks you through a lightweight dialectic to help you pick the one with the shortest path to something shipped.

### Coaching Modes

Based on intake, Etudes selects a coaching mode. It never announces the mode — it just shifts behavior:

| Mode | When | Behavior |
|------|------|----------|
| **Architect to Executor** | Elaborate plans, nothing shipped | Cut scope. "Your spec is for a funded team. You're one person." |
| **Confidence Builder** | Has skills but doesn't trust them | Validate with evidence. "You've shipped before. Same muscle." |
| **Focus Lock** | Keeps starting new projects | Name the pattern. Redirect. "That's a different project." |
| **Unblocking** | Stuck on a specific task | Break into 10-min chunks. Remove decisions. |
| **Accountability** | Goes quiet, reports no progress | Pick up where they left off. No shame. |

### Sprint Structure

5-day sprints. Each day has:
- 2-6 tasks (calibrated to your available time)
- Time estimates on every task
- "Done looks like" definitions
- End-of-day reflection prompts

Day 1 is always the easiest (build momentum). Day 5 is always "Ship Day" — put something in front of a real person.

### State Persistence

All state lives in `.etudes/` at your project root:

```
.etudes/
├── profile.md           # Your builder profile
├── sprint-current.md    # Active sprint with checkboxes
├── parking-lot.md       # Ideas captured mid-sprint
└── retros/
    └── sprint-1.md      # Past sprint retrospectives
```

This persists across Claude Code sessions. When you run `/etudes-checkin` tomorrow, it reads your sprint file and picks up where you left off.

## Plugin Structure

```
etudes/
├── .claude-plugin/
│   └── plugin.json           # Plugin metadata
├── commands/
│   ├── etudes.md             # /etudes — main entry
│   ├── etudes-checkin.md     # /etudes-checkin — daily check-in
│   ├── etudes-retro.md       # /etudes-retro — sprint retrospective
│   └── etudes-park.md        # /etudes-park — parking lot capture
├── skills/
│   └── etudes/
│       └── SKILL.md          # Core skill instructions (the brain)
├── system-prompt.md          # Claude Project version (standalone)
├── docs/
│   └── plans/
│       └── 2026-03-15-etudes-v1-design.md
└── README.md
```

## Distribution

- **skills.sh** — Automatically listed at [skills.sh/keecraw/etudes/etudes](https://skills.sh/keecraw/etudes/etudes)
- **GitHub** — Clone and install manually from this repo
- **Claude Code official plugins** — PR submitted to [anthropics/claude-code/plugins](https://github.com/anthropics/claude-code/tree/main/plugins)

## Design Principles

These shaped every decision in Etudes:

- **One question at a time.** Never dump a list. Never overwhelm.
- **Mirror, don't diagnose.** Show people their patterns. Don't label them.
- **Scope only shrinks.** Mid-sprint, nothing gets added. New ideas go to the parking lot.
- **Ship something visible.** Every sprint ends with something a real person can see.
- **Sprint 1 is calibration.** Don't judge the first sprint. It's learning how you work.
- **Name avoidance without judgment.** "This is the pattern" is observation, not accusation.
- **Direct, not motivational.** Be specific to the person's situation. Never generic.

## License

MIT
