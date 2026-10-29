import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist/web", { recursive: true });
await Promise.all([
  build({
    entryPoints: [
      "src/appInfo.ts",
      "src/app-entry.ts",
      "src/machineInfo.ts",
      "src/storageHealth.ts",
    "src/sensorProviders.ts",
      "src/sensorProcess.ts",
      "src/macSensors.ts",
      "src/trayMenu.ts",
      "src/windowUtils.ts",
      "src/platform.ts",
    ],
    outdir: "dist",
    platform: "node",
    format: "cjs",
    target: "node22",
    sourcemap: true,
    legalComments: "none",
  }),
  build({
    entryPoints: ["src/preload.ts"],
    outfile: "dist/preload.js",
    bundle: true,
    external: ["electron"],
    platform: "node",
    format: "cjs",
    target: "node22",
    sourcemap: true,
    legalComments: "none",
  }),
  build({
    entryPoints: ["src/web/app.ts"],
    outfile: "dist/web/app.js",
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "es2022",
    sourcemap: true,
    legalComments: "none",
  }),
  copyFile("src/web/index.html", "dist/web/index.html"),
]);
