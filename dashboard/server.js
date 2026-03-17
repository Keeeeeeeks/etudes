#!/usr/bin/env node

const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const PORT = Number(process.env.ETUDES_DASHBOARD_PORT || 2400);
const HOME = os.homedir();
const GLOBAL_DIR = path.join(HOME, ".etudes");
const GLOBAL_INDEX = path.join(GLOBAL_DIR, "projects.json");

const app = express();
app.use(express.json({ limit: "1mb" }));

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project";
}

function makeHash(input) {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 10);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafe(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readTextSafe(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function splitLines(content) {
  return content.split(/\r?\n/);
}

function normalizeProjectEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  const raw = [];
  for (const entry of entries) {
    if (typeof entry === "string" && entry.trim()) {
      raw.push({ path: entry.trim(), name: path.basename(entry.trim()), registered: null });
      continue;
    }

    if (entry && typeof entry === "object" && typeof entry.path === "string" && entry.path.trim()) {
      raw.push({
        path: entry.path.trim(),
        name: typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : path.basename(entry.path.trim()),
        registered: typeof entry.registered === "string" ? entry.registered : null,
      });
    }
  }

  const seenPath = new Set();
  const deduped = [];
  for (const p of raw) {
    const resolved = path.resolve(p.path);
    if (seenPath.has(resolved)) {
      continue;
    }
    seenPath.add(resolved);
    deduped.push({ ...p, path: resolved });
  }

  const slugCount = new Map();
  return deduped.map((p) => {
    const base = slugify(p.name || path.basename(p.path));
    const next = (slugCount.get(base) || 0) + 1;
    slugCount.set(base, next);
    const slug = next === 1 ? base : `${base}-${next}`;
    return { ...p, slug };
  });
}

async function loadProjects() {
  const entries = await readJsonSafe(GLOBAL_INDEX, []);
  const projects = normalizeProjectEntries(entries);

  for (const p of projects) {
    p.etudesDir = path.join(p.path, ".etudes");
    p.profilePath = path.join(p.etudesDir, "profile.md");
    p.sprintPath = path.join(p.etudesDir, "sprint-current.md");
    p.parkingPath = path.join(p.etudesDir, "parking-lot.md");
    p.boardPath = path.join(p.etudesDir, "board-state.json");
    p.exists = await fileExists(p.path);
    p.hasEtudes = await fileExists(p.etudesDir);
  }

  return projects;
}

function parseTasksFromSprint(sprintText) {
  const lines = splitLines(sprintText);
  const tasks = [];
  let section = "none";
  let day = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const dayMatch = /^##\s+Day\s+(\d+)/i.exec(line);
    if (dayMatch) {
      day = Number(dayMatch[1]);
      section = `day-${day}`;
      continue;
    }
    if (/^##\s+Backlog\b/i.test(line)) {
      day = null;
      section = "backlog";
      continue;
    }

    const taskMatch = /^- \[( |x)\]\s+\*\*(.+?)\*\*(?:\s+\(([^)]+)\))?(?:\s+\|\s+File:\s+`([^`]+)`)?(?:\s+\|\s+Done\s*=\s*(.+))?/i.exec(line);
    if (!taskMatch) {
      continue;
    }

    const checked = taskMatch[1] === "x";
    const title = (taskMatch[2] || "").trim();
    const estimate = (taskMatch[3] || "").trim() || null;
    const fileRef = (taskMatch[4] || "").trim() || null;
    const doneDefinition = (taskMatch[5] || "").trim() || null;

    const comments = [];
    let j = i + 1;
    while (j < lines.length && /^\s{2}>\s*/.test(lines[j])) {
      comments.push(lines[j].replace(/^\s{2}>\s*/, ""));
      j += 1;
    }

    const stateKey = makeHash(`${section}|${title}|${estimate || ""}|${fileRef || ""}|${doneDefinition || ""}`);
    tasks.push({
      id: `L${i + 1}`,
      lineIndex: i,
      section,
      day,
      checked,
      title,
      estimate,
      fileRef,
      doneDefinition,
      comments,
      stateKey,
      rawLine: line,
    });
  }

  return { lines, tasks };
}

function parseParkingIdeas(parkingText) {
  const lines = splitLines(parkingText);
  const ideas = [];
  for (const line of lines) {
    const m = /^- \[ \] (.+)$/.exec(line.trim());
    if (!m) {
      continue;
    }
    ideas.push(m[1]);
  }
  return ideas;
}

function getTaskById(parsed, taskId) {
  return parsed.tasks.find((t) => t.id === taskId) || null;
}

function boardStatusForTask(task, boardState) {
  const saved = boardState?.statuses?.[task.stateKey];
  if (saved === "backlog" || saved === "in_progress" || saved === "shipped") {
    return saved;
  }
  return task.checked ? "done" : "todo";
}

function buildTaskLine(task, checked) {
  const pieces = [`- [${checked ? "x" : " "}] **${task.title}**`];
  if (task.estimate) {
    pieces.push(`(${task.estimate})`);
  }
  if (task.fileRef) {
    pieces.push(`| File: \`${task.fileRef}\``);
  }
  if (task.doneDefinition) {
    pieces.push(`| Done = ${task.doneDefinition}`);
  }
  return pieces.join(" ");
}

function deleteTaskFromLines(lines, lineIndex) {
  const next = [...lines];
  next.splice(lineIndex, 1);
  while (lineIndex < next.length && /^\s{2}>\s*/.test(next[lineIndex])) {
    next.splice(lineIndex, 1);
  }
  return next;
}

function insertComment(lines, lineIndex, text) {
  const next = [...lines];
  let insertAt = lineIndex + 1;
  while (insertAt < next.length && /^\s{2}>\s*/.test(next[insertAt])) {
    insertAt += 1;
  }
  next.splice(insertAt, 0, `  > [${nowStamp()}] ${text}`);
  return next;
}

function ensureBacklogAndInsert(lines, taskLine) {
  const next = [...lines];
  let backlogIdx = next.findIndex((line) => /^##\s+Backlog\b/i.test(line));
  if (backlogIdx === -1) {
    if (next.length && next[next.length - 1] !== "") {
      next.push("");
    }
    next.push("## Backlog", "");
    backlogIdx = next.length - 2;
  }

  let insertAt = backlogIdx + 1;
  while (insertAt < next.length && !/^##\s+/.test(next[insertAt])) {
    insertAt += 1;
  }
  next.splice(insertAt, 0, taskLine);
  return next;
}

function insertTaskInDay(lines, day, taskLine) {
  const next = [...lines];
  const headingRegex = new RegExp(`^##\\s+Day\\s+${day}\\b`, "i");
  let dayIdx = next.findIndex((line) => headingRegex.test(line));

  if (dayIdx === -1) {
    if (next.length && next[next.length - 1] !== "") {
      next.push("");
    }
    next.push(`## Day ${day}`, "");
    dayIdx = next.length - 2;
  }

  let insertAt = dayIdx + 1;
  while (insertAt < next.length && !/^##\s+/.test(next[insertAt])) {
    insertAt += 1;
  }
  next.splice(insertAt, 0, taskLine);
  return next;
}

async function loadProjectState(project) {
  const sprintText = await readTextSafe(project.sprintPath);
  const profileText = await readTextSafe(project.profilePath);
  const parkingText = await readTextSafe(project.parkingPath);
  const boardState = await readJsonSafe(project.boardPath, { statuses: {} });

  const parsed = parseTasksFromSprint(sprintText);
  const tasks = parsed.tasks.map((t) => ({
    ...t,
    status: boardStatusForTask(t, boardState),
  }));

  const byStatus = {
    backlog: tasks.filter((t) => t.status === "backlog"),
    todo: tasks.filter((t) => t.status === "todo"),
    in_progress: tasks.filter((t) => t.status === "in_progress"),
    done: tasks.filter((t) => t.status === "done"),
    shipped: tasks.filter((t) => t.status === "shipped"),
  };

  const doneCount = tasks.filter((t) => t.checked || t.status === "shipped").length;
  const totalCount = tasks.length;
  const nextTask = tasks.find((t) => ["todo", "in_progress"].includes(t.status)) || null;

  return {
    sprintText,
    profileText,
    parkingText,
    boardState,
    parsed,
    tasks,
    byStatus,
    summary: {
      doneCount,
      totalCount,
      nextTask,
      parkingCount: parseParkingIdeas(parkingText).length,
    },
  };
}

async function saveSprint(project, lines) {
  await fs.writeFile(project.sprintPath, `${lines.join("\n")}\n`, "utf8");
}

async function saveBoardState(project, boardState) {
  await writeJson(project.boardPath, boardState);
}

function mustProject(projects, slug) {
  const project = projects.find((p) => p.slug === slug);
  if (!project) {
    const err = new Error(`Project not found: ${slug}`);
    err.status = 404;
    throw err;
  }
  if (!project.hasEtudes) {
    const err = new Error(`No .etudes directory for project: ${slug}`);
    err.status = 400;
    throw err;
  }
  return project;
}

app.get("/api/projects", async (req, res, next) => {
  try {
    const projects = await loadProjects();
    const detailed = [];

    for (const p of projects) {
      if (!p.hasEtudes) {
        detailed.push({ ...p, summary: null, missing: !p.exists });
        continue;
      }
      const state = await loadProjectState(p);
      detailed.push({ ...p, summary: state.summary, missing: !p.exists });
    }

    res.json({ projects: detailed, generatedAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

app.get("/api/projects/:slug", async (req, res, next) => {
  try {
    const projects = await loadProjects();
    const project = mustProject(projects, req.params.slug);
    const state = await loadProjectState(project);
    res.json({
      project,
      summary: state.summary,
      tasks: state.tasks,
      columns: state.byStatus,
      parking: parseParkingIdeas(state.parkingText),
    });
  } catch (err) {
    next(err);
  }
});

app.patch("/api/projects/:slug/tasks/:id/status", async (req, res, next) => {
  try {
    const { status } = req.body || {};
    const valid = ["backlog", "todo", "in_progress", "done", "shipped"];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const projects = await loadProjects();
    const project = mustProject(projects, req.params.slug);
    const state = await loadProjectState(project);
    const task = getTaskById(state.parsed, req.params.id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    const lines = [...state.parsed.lines];
    const shouldCheck = status === "done" || status === "shipped";
    lines[task.lineIndex] = buildTaskLine(task, shouldCheck);
    await saveSprint(project, lines);

    const nextBoard = state.boardState || { statuses: {} };
    nextBoard.statuses = nextBoard.statuses || {};
    if (["backlog", "in_progress", "shipped"].includes(status)) {
      nextBoard.statuses[task.stateKey] = status;
    } else {
      delete nextBoard.statuses[task.stateKey];
    }
    await saveBoardState(project, nextBoard);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.patch("/api/projects/:slug/tasks/:id", async (req, res, next) => {
  try {
    const body = req.body || {};
    const projects = await loadProjects();
    const project = mustProject(projects, req.params.slug);
    const state = await loadProjectState(project);
    const task = getTaskById(state.parsed, req.params.id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    const nextTask = {
      ...task,
      title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : task.title,
      estimate: body.estimate === null ? null : (typeof body.estimate === "string" ? body.estimate.trim() : task.estimate),
      fileRef: body.fileRef === null ? null : (typeof body.fileRef === "string" ? body.fileRef.trim() : task.fileRef),
      doneDefinition: body.doneDefinition === null ? null : (typeof body.doneDefinition === "string" ? body.doneDefinition.trim() : task.doneDefinition),
    };

    const lines = [...state.parsed.lines];
    lines[task.lineIndex] = buildTaskLine(nextTask, task.checked);
    await saveSprint(project, lines);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/projects/:slug/tasks/:id", async (req, res, next) => {
  try {
    const projects = await loadProjects();
    const project = mustProject(projects, req.params.slug);
    const state = await loadProjectState(project);
    const task = getTaskById(state.parsed, req.params.id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    const lines = deleteTaskFromLines(state.parsed.lines, task.lineIndex);
    await saveSprint(project, lines);

    const nextBoard = state.boardState || { statuses: {} };
    if (nextBoard.statuses && task.stateKey in nextBoard.statuses) {
      delete nextBoard.statuses[task.stateKey];
      await saveBoardState(project, nextBoard);
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post("/api/projects/:slug/tasks/:id/comments", async (req, res, next) => {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      return res.status(400).json({ error: "Comment text required" });
    }

    const projects = await loadProjects();
    const project = mustProject(projects, req.params.slug);
    const state = await loadProjectState(project);
    const task = getTaskById(state.parsed, req.params.id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    const lines = insertComment(state.parsed.lines, task.lineIndex, text);
    await saveSprint(project, lines);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post("/api/projects/:slug/tasks", async (req, res, next) => {
  try {
    const body = req.body || {};
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return res.status(400).json({ error: "Task title required" });
    }

    const status = typeof body.status === "string" ? body.status : "backlog";
    const day = Number(body.day || 1);
    const task = {
      title,
      estimate: typeof body.estimate === "string" && body.estimate.trim() ? body.estimate.trim() : null,
      fileRef: typeof body.fileRef === "string" && body.fileRef.trim() ? body.fileRef.trim() : null,
      doneDefinition: typeof body.doneDefinition === "string" && body.doneDefinition.trim() ? body.doneDefinition.trim() : null,
    };

    const projects = await loadProjects();
    const project = mustProject(projects, req.params.slug);
    const sprintText = await readTextSafe(project.sprintPath);
    const lines = splitLines(sprintText);

    const taskLine = buildTaskLine(task, status === "done" || status === "shipped");
    const nextLines = status === "backlog" ? ensureBacklogAndInsert(lines, taskLine) : insertTaskInDay(lines, Number.isFinite(day) ? day : 1, taskLine);

    await saveSprint(project, nextLines);

    const parsedNew = parseTasksFromSprint(nextLines.join("\n"));
    const created = parsedNew.tasks[parsedNew.tasks.length - 1];
    const boardState = await readJsonSafe(project.boardPath, { statuses: {} });
    boardState.statuses = boardState.statuses || {};
    if (["backlog", "in_progress", "shipped"].includes(status)) {
      boardState.statuses[created.stateKey] = status;
    }
    await saveBoardState(project, boardState);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post("/api/projects/:slug/park", async (req, res, next) => {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      return res.status(400).json({ error: "Park text required" });
    }

    const day = typeof req.body?.day === "string" && req.body.day.trim() ? req.body.day.trim() : "?";

    const projects = await loadProjects();
    const project = mustProject(projects, req.params.slug);
    const existing = await readTextSafe(project.parkingPath);
    const lines = splitLines(existing);
    lines.push(`- [ ] ${text} (captured Day ${day})`);
    await fs.writeFile(project.parkingPath, `${lines.filter((l, i) => i !== 0 || l !== "").join("\n")}\n`, "utf8");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.get("/api/health", async (req, res) => {
  const projects = await loadProjects();
  res.json({ ok: true, projects: projects.length, date: todayIso() });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/:route", (req, res) => {
  if (req.params.route.startsWith("api")) {
    return res.status(404).json({ error: "Not found" });
  }
  return res.sendFile(path.join(__dirname, "index.html"));
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, async () => {
  await fs.mkdir(GLOBAL_DIR, { recursive: true });
  console.log(`Etudes dashboard running at http://localhost:${PORT}`);
});
