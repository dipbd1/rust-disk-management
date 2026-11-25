#!/usr/bin/env node
/**
 * Fail if @tauri-apps/* major.minor drifts from the matching Rust crate in
 * src-tauri/Cargo.lock. Catches the same class of error as `tauri build`
 * ("Found version mismatched Tauri packages") without a full Windows bundle.
 *
 * Mapping:
 *   @tauri-apps/api          ↔ tauri
 *   @tauri-apps/plugin-<name> ↔ tauri-plugin-<name>
 *   @tauri-apps/cli          ↔ same major.minor as crate "tauri" (CLI tracks core)
 *
 * Usage (repo root): node scripts/check-tauri-plugin-versions.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(`check-tauri-plugin-versions: ${message}`);
  process.exit(1);
}

function majorMinor(version) {
  const m = /^(\d+)\.(\d+)\./.exec(version);
  if (!m) fail(`cannot parse semver "${version}"`);
  return `${m[1]}.${m[2]}`;
}

function cargoPackageVersions(lockText) {
  const versions = new Map();
  // Accept LF or CRLF (Windows runners may check out Cargo.lock with CRLF).
  const re = /^name = "([^"]+)"\r?\nversion = "([^"]+)"/gm;
  let match;
  while ((match = re.exec(lockText)) !== null) {
    const [, name, version] = match;
    // First occurrence is the resolved package used by this workspace.
    if (!versions.has(name)) versions.set(name, version);
  }
  return versions;
}

function npmPackageVersions(lock) {
  const versions = new Map();
  for (const [key, meta] of Object.entries(lock.packages ?? {})) {
    if (!key.startsWith("node_modules/@tauri-apps/")) continue;
    // Skip platform-specific optional CLI binaries.
    if (key !== "node_modules/@tauri-apps/cli" && key.includes("cli-")) continue;
    const name = key.slice("node_modules/".length);
    if (typeof meta.version === "string") versions.set(name, meta.version);
  }
  return versions;
}

const cargoLock = fs.readFileSync(path.join(root, "src-tauri/Cargo.lock"), "utf8");
const npmLock = JSON.parse(
  fs.readFileSync(path.join(root, "package-lock.json"), "utf8"),
);

const cargo = cargoPackageVersions(cargoLock);
const npm = npmPackageVersions(npmLock);

const pairs = [];

for (const [npmName, npmVersion] of npm) {
  if (npmName === "@tauri-apps/api") {
    pairs.push({ npmName, npmVersion, crate: "tauri" });
    continue;
  }
  if (npmName === "@tauri-apps/cli") {
    pairs.push({ npmName, npmVersion, crate: "tauri", label: "tauri (CLI tracks core)" });
    continue;
  }
  const m = /^@tauri-apps\/plugin-(.+)$/.exec(npmName);
  if (m) {
    pairs.push({ npmName, npmVersion, crate: `tauri-plugin-${m[1]}` });
  }
}

if (pairs.length === 0) {
  fail("no @tauri-apps packages found in package-lock.json");
}

const mismatches = [];
for (const { npmName, npmVersion, crate, label } of pairs) {
  const rustVersion = cargo.get(crate);
  if (!rustVersion) {
    mismatches.push(
      `${npmName}@${npmVersion} has no matching crate "${crate}" in Cargo.lock`,
    );
    continue;
  }
  const npmMm = majorMinor(npmVersion);
  const rustMm = majorMinor(rustVersion);
  if (npmMm !== rustMm) {
    mismatches.push(
      `${npmName}@${npmVersion} (${npmMm}) ≠ ${crate}@${rustVersion} (${rustMm})` +
        (label ? ` [${label}]` : ""),
    );
  } else {
    console.log(
      `OK  ${npmName}@${npmVersion} ↔ ${crate}@${rustVersion}`,
    );
  }
}

// Rust plugins without a JS binding are fine (e.g. dialog used only from Rust).
// Report them for visibility when a JS package exists under another name.
for (const [crate] of cargo) {
  if (!crate.startsWith("tauri-plugin-")) continue;
  const plugin = crate.slice("tauri-plugin-".length);
  const npmName = `@tauri-apps/plugin-${plugin}`;
  if (!npm.has(npmName)) {
    console.log(`--  ${crate}@${cargo.get(crate)} (no ${npmName} in package-lock; OK if Rust-only)`);
  }
}

if (mismatches.length > 0) {
  console.error("\ncheck-tauri-plugin-versions: major.minor mismatch:");
  for (const line of mismatches) console.error(`  - ${line}`);
  console.error(
    "\nPin @tauri-apps/* to the same major.minor as the Rust crates (see RELEASING.md / MSRV 1.85).",
  );
  console.error(
    "Example: keep tauri-plugin-updater 2.12.x and set \"@tauri-apps/plugin-updater\": \"~2.12.0\".",
  );
  process.exit(1);
}

console.log("check-tauri-plugin-versions: all @tauri-apps packages match Cargo.lock major.minor");
