import { build } from "esbuild";

await build({
  entryPoints: [
    "src/web/model/monitor.ts",
    "src/web/views/hardware.ts",
    "src/web/views/storage.ts",
    "src/storageHealth.ts",
    "src/sensorProviders.ts",
    "src/sensorProcess.ts",
    "src/macSensors.ts",
    "src/web/report.ts",
    "src/web/model/sensors.ts",
    "src/web/model/thermals.ts",
    "src/web/lib/format.ts",
    "src/web/lib/dom.ts",
  ],
  outdir: ".test-build",
  entryNames: "[name]",
  bundle: true,
  packages: "external",
  platform: "node",
  format: "cjs",
  target: "node22",
  legalComments: "none",
});
