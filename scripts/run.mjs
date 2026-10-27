#!/usr/bin/env node
// Prepare build/webmail, then run a command inside it with its local
// binaries on PATH: node scripts/run.mjs COMMAND [ARGUMENTS...]
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { prepare } from "./prepare.mjs";

try {
  const [command, ...args] = process.argv.slice(2);
  if (!command) throw new Error("Usage: node scripts/run.mjs COMMAND [ARGUMENTS...]");
  const directory = prepare();
  if (!fs.existsSync(path.join(directory, "node_modules"))) throw new Error("Install the webmail dependencies first: npm run install:webmail");
  const PATH = [path.join(directory, "node_modules/.bin"), process.env.PATH].join(path.delimiter);
  const result = spawnSync(command, args, { cwd: directory, stdio: "inherit", env: { ...process.env, PATH } });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
