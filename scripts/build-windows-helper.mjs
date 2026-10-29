import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, cp, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

const requested = process.argv.find((arg) => arg.startsWith("--arch="))?.split("=")[1];
if (process.platform !== "win32" && !requested) process.exit(0);
const arch = requested || process.arch;
if (arch !== "x64") throw new Error(`Windows sensor builds currently support x64 only; requested ${arch}.`);
const output = path.resolve(`native/windows/publish/${arch}`);
const dotnet = process.env.SENSOR_DOTNET || "dotnet";
const result = spawnSync(dotnet, ["publish", "native/windows/SensorHelper.csproj", "-c", "Release", "-r", `win-${arch}`, "--self-contained", "true", "-p:RestoreLockedMode=true", "-p:UseSharedCompilation=false", "-o", output], { stdio: "inherit" });
if (result.error || result.status !== 0) throw new Error("Windows sensor helper build failed. Install the .NET 10 SDK, then run npm run build:windows-helper. " + (result.error?.message || ""));
await mkdir(path.join(output, "licenses"), { recursive: true });
await cp("native/windows/licenses", path.join(output, "licenses"), { recursive: true });

const driver = JSON.parse(await readFile("native/windows/driver.json", "utf8"));
const driverPath = path.join(output, "PawnIO_setup.exe");
let binary;
try { binary = await readFile(driverPath); } catch { /* First build downloads the pinned installer. */ }
if (!binary || createHash("sha256").update(binary).digest("hex") !== driver.sha256) {
  const response = await fetch(driver.url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Driver download failed: ${response.status}`);
  binary = Buffer.from(await response.arrayBuffer());
}
if (createHash("sha256").update(binary).digest("hex") !== driver.sha256) throw new Error("Driver installer checksum mismatch.");
await writeFile(driverPath, binary);
await writeFile(path.join(output, "driver.json"), JSON.stringify(driver, null, 2));
const assets = JSON.parse(await readFile("native/windows/obj/project.assets.json", "utf8"));
for (const library of Object.values(assets.libraries)) {
  if (library.type !== "package") continue;
  for (const folder of Object.keys(assets.packageFolders)) {
    const root = path.join(folder, library.path);
    let files;
    try { files = await readdir(root); } catch { continue; }
    const destination = path.join(output, "licenses", library.path.replaceAll("/", "-"));
    await mkdir(destination, { recursive: true });
    for (const file of files.filter((name) => /license|copying|notice|\.nuspec$/i.test(name))) {
      await cp(path.join(root, file), path.join(destination, file), { recursive: true });
    }
    break;
  }
}
