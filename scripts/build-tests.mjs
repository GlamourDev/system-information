import { build } from "esbuild";

await build({
  entryPoints: [
    "src/web/model/monitor.ts",
    "src/web/model/sensors.ts",
    "src/web/lib/format.ts",
    "src/web/lib/dom.ts",
  ],
  outdir: ".test-build",
  entryNames: "[name]",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  legalComments: "none",
});
