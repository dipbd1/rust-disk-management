#!/usr/bin/env node
/**
 * Set or check the app version across package.json, package-lock.json,
 * src-tauri/Cargo.toml, src-tauri/Cargo.lock, and src-tauri/tauri.conf.json.
 *
 * Usage (from repo root, works on Windows/macOS/Linux with Node):
 *   node scripts/bump-version.mjs 0.1.2
 *   node scripts/bump-version.mjs --from-branch
 *   node scripts/bump-version.mjs --check 0.1.2
 *   node scripts/bump-version.mjs --check --from-branch
 *
 * --from-branch reads the version after "release/" on the current git branch
 * (e.g. release/0.1.2 → 0.1.2).
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const fromBranch = args.includes("--from-branch");
const positional = args.filter((a) => !a.startsWith("--"));

function fail(message) {
  console.error(`bump-version: ${message}`);
  process.exit(1);
}

function currentBranch() {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  } catch {
    fail("could not read current git branch (is this a git checkout?)");
  }
}

function versionFromBranch(branch) {
  const m = /^release\/(.+)$/.exec(branch);
  if (!m) {
    fail(
      `branch "${branch}" is not release/<version>. Use release/0.1.2 or pass an explicit version.`,
    );
  }
  return m[1];
}

function resolveExpectedVersion() {
  if (fromBranch) {
    const v = versionFromBranch(currentBranch());
    if (positional.length > 0 && positional[0] !== v) {
      fail(
        `CLI version "${positional[0]}" does not match branch version "${v}"`,
      );
    }
    return v;
  }
  if (positional.length !== 1) {
    fail(
      "usage: node scripts/bump-version.mjs [--check] <version>|--from-branch",
    );
  }
  return positional[0];
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
}

function readText(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function writeText(rel, text) {
  fs.writeFileSync(path.join(root, rel), text, "utf8");
}

function packageVersionFromCargoToml(text) {
  const m = /^\[package\]\s*\n(?:[^\n]*\n)*?version\s*=\s*"([^"]+)"/m.exec(
    text,
  );
  if (!m) fail("src-tauri/Cargo.toml: could not find [package] version");
  return m[1];
}

function setCargoTomlVersion(text, version) {
  let seenPackage = false;
  const lines = text.split(/(?<=\n)/);
  let replaced = false;
  const out = lines.map((line) => {
    if (line.startsWith("[")) {
      seenPackage = line.trim() === "[package]";
    }
    if (seenPackage && /^version\s*=\s*"[^"]+"\s*$/.test(line.trimEnd())) {
      replaced = true;
      seenPackage = false;
      return `version = "${version}"\n`;
    }
    return line;
  });
  if (!replaced) fail("src-tauri/Cargo.toml: could not replace [package] version");
  return out.join("");
}

function cargoLockPackageVersion(text) {
  const block =
    /\nname = "disk-space-management"\nversion = "([^"]+)"\n/.exec(
      `\n${text}`,
    ) ?? fail('src-tauri/Cargo.lock: missing package "disk-space-management"');
  return block[1];
}

function setCargoLockPackageVersion(text, version) {
  const next = text.replace(
    /(\nname = "disk-space-management"\nversion = ")[^"]+("\n)/,
    `$1${version}$2`,
  );
  if (next === text) {
    fail('src-tauri/Cargo.lock: could not replace "disk-space-management" version');
  }
  return next;
}

function collectVersions() {
  const pkg = readJson("package.json");
  const lock = readJson("package-lock.json");
  const tauri = readJson("src-tauri/tauri.conf.json");
  const cargoToml = readText("src-tauri/Cargo.toml");
  const cargoLock = readText("src-tauri/Cargo.lock");
  return {
    "package.json": pkg.version,
    "package-lock.json (root)": lock.version,
    'package-lock.json (packages[""])': lock.packages?.[""]?.version,
    "src-tauri/tauri.conf.json": tauri.version,
    "src-tauri/Cargo.toml": packageVersionFromCargoToml(cargoToml),
    "src-tauri/Cargo.lock": cargoLockPackageVersion(cargoLock),
  };
}

function setPackageJsonVersion(text, version) {
  const next = text.replace(
    /^(\s*"version"\s*:\s*")[^"]+(")/m,
    `$1${version}$2`,
  );
  if (next === text) fail("package.json: could not replace version");
  return next;
}

function setPackageLockVersions(text, version) {
  // Root "version" then packages[""].version — first two top-level package versions only.
  let count = 0;
  const next = text.replace(/"version"\s*:\s*"[^"]+"/g, (match) => {
    if (count >= 2) return match;
    count += 1;
    return `"version": "${version}"`;
  });
  if (count < 2) {
    fail("package-lock.json: expected root and packages[\"\"] version fields");
  }
  return next;
}

function setTauriConfVersion(text, version) {
  const next = text.replace(
    /^(\s*"version"\s*:\s*")[^"]+(")/m,
    `$1${version}$2`,
  );
  if (next === text) fail("src-tauri/tauri.conf.json: could not replace version");
  return next;
}

function applyVersion(version) {
  writeText(
    "package.json",
    setPackageJsonVersion(readText("package.json"), version),
  );
  writeText(
    "package-lock.json",
    setPackageLockVersions(readText("package-lock.json"), version),
  );
  writeText(
    "src-tauri/tauri.conf.json",
    setTauriConfVersion(readText("src-tauri/tauri.conf.json"), version),
  );
  writeText(
    "src-tauri/Cargo.toml",
    setCargoTomlVersion(readText("src-tauri/Cargo.toml"), version),
  );
  writeText(
    "src-tauri/Cargo.lock",
    setCargoLockPackageVersion(readText("src-tauri/Cargo.lock"), version),
  );
}

const expected = resolveExpectedVersion();
if (!VERSION_RE.test(expected)) {
  fail(`invalid version "${expected}" (want X.Y.Z or semver with pre-release)`);
}

const found = collectVersions();
const mismatches = Object.entries(found).filter(([, v]) => v !== expected);

if (checkOnly) {
  if (mismatches.length === 0) {
    console.log(`bump-version: OK — all version fields are ${expected}`);
    process.exit(0);
  }
  console.error(
    `bump-version: version mismatch (expected ${expected} from ${fromBranch ? "branch" : "CLI"}):`,
  );
  for (const [file, v] of mismatches) {
    console.error(`  - ${file}: found "${v}", expected "${expected}"`);
  }
  console.error(
    "Fix with: node scripts/bump-version.mjs --from-branch   (on a release/X.Y.Z branch)",
  );
  process.exit(1);
}

if (mismatches.length === 0) {
  console.log(`bump-version: already ${expected} everywhere`);
  process.exit(0);
}

applyVersion(expected);
const after = collectVersions();
const stillBad = Object.entries(after).filter(([, v]) => v !== expected);
if (stillBad.length > 0) {
  fail(`write incomplete: ${stillBad.map(([f, v]) => `${f}=${v}`).join(", ")}`);
}
console.log(`bump-version: set version to ${expected} in:`);
for (const file of Object.keys(after)) {
  console.log(`  - ${file}`);
}
