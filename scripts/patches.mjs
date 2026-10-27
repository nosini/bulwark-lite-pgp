#!/usr/bin/env node
// Edit the patches as Git commits.
//
//   node scripts/patches.mjs edit     # build/edit: upstream plus one commit per patch
//   node scripts/patches.mjs export   # write each commit back to patches/<subject>.patch
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patches = path.join(root, "patches"), edit = path.join(root, "build/edit");
// Scratch commits: no signing prompt, and no dependence on the user's identity.
const git = ["-c", "commit.gpgsign=false", "-c", "user.name=patches", "-c", "user.email=patches@localhost"];

function run(args, cwd, options = {}) {
  const result = spawnSync("git", [...git, ...args], { cwd, encoding: "utf8", maxBuffer: 1 << 28, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  return result.stdout;
}

// Rerunning continues after the last patch committed in build/edit, so a
// patch that no longer applies can be resolved and committed by hand.
function editTree() {
  if (!fs.existsSync(edit)) {
    run(["clone", "--quiet", path.join(root, "upstream/webmail"), edit], root);
    run(["branch", "upstream"], edit);
  }
  const done = new Set(run(["log", "--format=%s", "upstream..HEAD"], edit).split("\n"));
  for (const file of fs.readdirSync(patches).filter((file) => file.endsWith(".patch")).sort()) {
    const name = file.replace(/\.patch$/, "");
    if (done.has(name)) continue;
    if (run(["status", "--porcelain"], edit)) throw new Error(`build/edit has uncommitted changes. Resolve them, commit them as "${name}" and run edit again.`);
    // --3way leaves conflict markers where upstream changed under the patch.
    const result = spawnSync("git", [...git, "apply", "--3way", path.join(patches, file)], { cwd: edit, encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`${file} no longer applies:\n${result.stderr}\nResolve the conflicts in build/edit, commit them as "${name}" and run edit again.`);
    }
    run(["add", "--all"], edit);
    run(["commit", "--quiet", "--allow-empty", "-m", name], edit);
  }
  console.log("Prepared build/edit. Commit your changes to the patch they belong to, then run export.");
}

function exportTree() {
  if (run(["status", "--porcelain"], edit)) throw new Error("build/edit has uncommitted changes.");
  const commits = run(["log", "--reverse", "--format=%H %s", "upstream..HEAD"], edit).trim().split("\n").filter(Boolean);
  const names = commits.map((line) => line.slice(41));
  for (const name of names) {
    if (!/^\d{4}-[a-z0-9-]+$/.test(name)) throw new Error(`Commit subject "${name}" is not a patch name like 0001-topic.`);
  }
  for (const file of fs.readdirSync(patches)) if (file.endsWith(".patch")) fs.rmSync(path.join(patches, file));
  for (const [index, line] of commits.entries()) {
    const commit = line.slice(0, 40);
    fs.writeFileSync(path.join(patches, `${names[index]}.patch`), run(["diff", "--no-color", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/", `${commit}~`, commit], edit));
  }
  console.log(`Wrote ${commits.length} patches. Delete build/edit when you're done.`);
}

try {
  const command = process.argv[2];
  if (command === "edit") editTree();
  else if (command === "export") exportTree();
  else throw new Error("Usage: node scripts/patches.mjs edit|export");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
