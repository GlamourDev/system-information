import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { availableParallelism } from "node:os";
import { mkdir, readFile, writeFile, cp, chmod, rm } from "node:fs/promises";
import path from "node:path";

const platform = process.argv.find(arg => arg.startsWith("--platform="))?.split("=")[1] || process.platform;
const arch = process.argv.find(arg => arg.startsWith("--arch="))?.split("=")[1] || process.arch;
if (platform !== "darwin" && platform !== "win32") process.exit(0);
if (!(platform === "darwin" ? ["arm64", "x64"] : ["x64"]).includes(arch)) throw new Error(`Unsupported smartmontools target: ${platform}/${arch}`);
const root = path.resolve("native/smartmontools");
const release = JSON.parse(await readFile(path.join(root, "release.json"), "utf8"));
const output = path.join(root, "publish", `${platform}-${arch}`);
const work = path.join(root, "work", `${platform}-${arch}`);
const digest = data => createHash("sha256").update(data).digest("hex");
async function download(asset) {
  const file = path.join(root, "cache", asset.name);
  await mkdir(path.dirname(file), { recursive: true });
  let data;
  try { data = await readFile(file); } catch { /* Download first build. */ }
  if (!data || digest(data) !== asset.sha256) {
    const response = await fetch(asset.url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`smartmontools download failed: ${response.status}`);
    data = Buffer.from(await response.arrayBuffer());
  }
  if (digest(data) !== asset.sha256) throw new Error(`smartmontools checksum mismatch: ${asset.name}`);
  await writeFile(file, data);
  return file;
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message || result.status}`);
}
const source = await download(release.source);
await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });
await mkdir(output, { recursive: true });
// Git Bash's GNU tar interprets "D:" in an absolute archive path as a
// remote host. Resolve the archive relative to cwd on every build platform.
run("tar", ["-xzf", path.relative(work, source)], { cwd: work });
const sourceRoot = path.join(work, `smartmontools-${release.version}`);
if (platform === "darwin") {
  if (process.platform !== "darwin") throw new Error("macOS smartctl must be built on macOS.");
  const cpu = arch === "x64" ? "x86_64" : "arm64";
  const flags = `-O2 -arch ${cpu} -mmacosx-version-min=11.0`;
  run("/bin/sh", ["./configure", "--without-smartd", "--without-initscript", "--without-update-smart-drivedb", "--with-drivedbdir=no", `--host=${cpu}-apple-darwin`], {
    cwd: sourceRoot,
    env: { ...process.env, CFLAGS: flags, CXXFLAGS: flags, LDFLAGS: `-arch ${cpu} -mmacosx-version-min=11.0`, SOURCE_DATE_EPOCH: "1745971200" },
  });
  run("make", [`-j${Math.min(availableParallelism(), 8)}`, "smartctl"], { cwd: sourceRoot });
  await cp(path.join(sourceRoot, "smartctl"), path.join(output, "smartctl"));
  await chmod(path.join(output, "smartctl"), 0o755);
  run("codesign", ["--force", "--sign", "-", path.join(output, "smartctl")]);
} else {
  const installer = await download(release.windows);
  // Extract only. Never execute the installer or change the build machine's installation.
  const sevenZip = process.env.SMARTMONTOOLS_7Z || (process.platform === "win32" ? path.join(process.env.ProgramFiles || "C:\\Program Files", "7-Zip", "7z.exe") : "7zz");
  const extracted = path.join(work, "windows");
  run(sevenZip, ["x", "-y", `-o${extracted}`, installer]);
  const exe = path.join(extracted, "bin", "smartctl.exe");
  const binary = await readFile(exe);
  // Reject accidentally selected 32-bit executable from the dual-architecture installer.
  if (binary.readUInt16LE(binary.readUInt32LE(0x3c) + 4) !== 0x8664) throw new Error("Expected Windows x64 smartctl.");
  await cp(exe, path.join(output, "smartctl.exe"));
  // Keep all upstream notices and compiler runtime licenses from the distribution.
  await cp(path.join(extracted, "doc"), path.join(output, "upstream-doc"), { recursive: true });
}
await cp(path.join(sourceRoot, "drivedb.h"), path.join(output, "drivedb.h"));
for (const name of ["COPYING", "AUTHORS"]) await cp(path.join(sourceRoot, name), path.join(output, name));
// Supply corresponding source alongside every binary, including upstream build files.
await cp(source, path.join(output, release.source.name));
await cp("scripts/build-smartmontools.mjs", path.join(output, "build-smartmontools.mjs"));
await cp(path.join(root, "release.json"), path.join(output, "release.json"));
await writeFile(path.join(output, "NOTICE.txt"), `smartmontools ${release.version}\nhttps://www.smartmontools.org/\nSeparate executable distributed under GPL-2.0-or-later; see COPYING.\nUnmodified corresponding source: ${release.source.name}\nThe application invokes smartctl through its JSON command-line interface.\nBuild recipe and pinned release metadata are included.\n`);
console.log(`Prepared bundled smartmontools: ${output}`);
