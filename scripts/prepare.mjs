#!/usr/bin/env node
// Assemble build/webmail: upstream's committed files, our patches, our new
// source files and our locale keys. Installed dependencies survive reruns.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  return result.stdout;
}

function copyUpstream(source, destination) {
  if (!fs.existsSync(path.join(source, "package.json"))) {
    throw new Error("Upstream source is missing. Run git submodule update --init --recursive.");
  }
  if (fs.existsSync(path.join(source, ".git"))) {
    // Copy committed files only. Local changes to upstream must be reviewed,
    // rather than silently included in a build pinned to a different source.
    run("git", ["diff", "--exit-code", "HEAD", "--"], source);
    const files = run("git", ["ls-files", "-z"], source).split("\0").filter(Boolean);
    for (const filename of files) {
      const to = path.join(destination, filename);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.cpSync(path.join(source, filename), to, { preserveTimestamps: true, verbatimSymlinks: true });
    }
  } else {
    fs.cpSync(source, destination, { recursive: true, verbatimSymlinks: true, filter: (file) => ![".git", "node_modules"].includes(path.basename(file)) });
  }
}

function overlay(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name), to = path.join(destination, entry.name);
    if (entry.isDirectory()) overlay(from, to);
    else {
      if (fs.existsSync(to)) throw new Error(`Our file now exists upstream: ${path.relative(destination, to)}. Review the overlap before building.`);
      fs.copyFileSync(from, to);
      fs.chmodSync(to, fs.statSync(from).mode);
    }
  }
}

export function mergeKeys(target, additions, location = []) {
  for (const [key, value] of Object.entries(additions)) {
    const here = [...location, key];
    const isObject = (item) => typeof item === "object" && item !== null && !Array.isArray(item);
    if (!(key in target)) target[key] = value;
    else if (isObject(value) && isObject(target[key])) mergeKeys(target[key], value, here);
    else throw new Error(`Our locale key now exists upstream: ${here.join(".")}`);
  }
  return target;
}

// Upstream's locale files mix line endings; write back the dominant one.
export function mergeLocaleText(text, additions) {
  const crlf = (text.match(/\r\n/g) ?? []).length, lf = (text.match(/\n/g) ?? []).length - crlf;
  const json = JSON.stringify(mergeKeys(JSON.parse(text), additions), null, 2);
  const ending = /\r?\n$/.test(text) ? "\n" : "";
  return (json + ending).replace(/\n/g, crlf > lf ? "\r\n" : "\n");
}

function mergeLocales(source, destination) {
  const fallback = path.join(source, "en");
  for (const language of fs.readdirSync(destination)) {
    // Languages we have no translations for get the English keys.
    const directory = fs.existsSync(path.join(source, language)) ? path.join(source, language) : fallback;
    for (const filename of fs.readdirSync(directory)) {
      const to = path.join(destination, language, filename);
      if (!fs.existsSync(to)) throw new Error(`Upstream has no locale file ${path.relative(destination, to)}`);
      const additions = JSON.parse(fs.readFileSync(path.join(directory, filename), "utf8"));
      try { fs.writeFileSync(to, mergeLocaleText(fs.readFileSync(to, "utf8"), additions)); }
      catch (error) { throw new Error(`${path.relative(destination, to)}: ${error.message}`); }
    }
  }
  for (const language of fs.readdirSync(source)) {
    if (!fs.existsSync(path.join(destination, language))) throw new Error(`Upstream no longer has locale ${language}`);
  }
}

export function prepare({ root = projectRoot, version = process.env.WEBMAIL_VERSION } = {}) {
  const parent = path.join(root, "build"), output = path.join(parent, "webmail");
  fs.mkdirSync(parent, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(parent, ".webmail-"));
  try {
    copyUpstream(path.join(root, "upstream/webmail"), temporary);
    const patchDirectory = path.join(root, "patches");
    const patches = fs.readdirSync(patchDirectory).filter((file) => file.endsWith(".patch")).sort();
    for (const patch of patches) {
      // Stop Git at the build directory: applying a patch must never consult
      // or modify the parent repository's index.
      const options = { env: { ...process.env, GIT_CEILING_DIRECTORIES: parent } };
      const filename = path.join(patchDirectory, patch);
      try {
        run("git", ["apply", "--no-index", "--check", filename], temporary, options);
        run("git", ["apply", "--no-index", filename], temporary, options);
      } catch (error) { throw new Error(`${patch} no longer applies: ${error.message}`); }
    }
    overlay(path.join(root, "src"), temporary);
    mergeLocales(path.join(root, "locales"), path.join(temporary, "locales"));
    // Releases are versioned by our tag, e.g. 1.18.0-1, not by upstream's.
    if (version) fs.writeFileSync(path.join(temporary, "VERSION"), `${version}\n`);
    // Keep installed dependencies across prepares. Everything else is rebuilt,
    // so removed source files and another target's build output cannot linger.
    const modules = path.join(output, "node_modules");
    if (fs.existsSync(modules)) fs.renameSync(modules, path.join(temporary, "node_modules"));
    fs.rmSync(output, { recursive: true, force: true });
    fs.renameSync(temporary, output);
    return output;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(`Prepared ${path.relative(projectRoot, prepare())}`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
