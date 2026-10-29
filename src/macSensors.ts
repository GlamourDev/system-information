// Runs in a separate process so a stalled native driver cannot block Electron.
import { createInterface } from "node:readline";
import type { ExtendedSensors } from "./sensorProviders.js";
import { sensorNumber } from "./sensorProviders.js";
import type { SensorReading } from "./web/model/types.js";

function collect(): ExtendedSensors {
const result: ExtendedSensors = { readings: [] };
function add(id: string, name: string, value: unknown, unit: SensorReading["unit"], group = "Thermals") {
  const number = sensorNumber(value);
  result.readings.push({ id, name, group, value: unit === "°C" && number === 0 ? null : number, unit, source: "macOS SMC / IOHID" });
}
try {
  if (process.arch === "arm64") {
    const native = require("macos-temperature-sensor") as {
      temperature(): { cpu: number; gpu: number; soc: number; cpuDieTemps: number[]; gpuDieTemps: number[] };
      fans(): { label: string; rpm: number }[];
    };
    try {
    const temps = native.temperature();
    add("temperature", "CPU temperature", temps.cpu, "°C");
    add("gpuTemperature", "GPU temperature", temps.gpu, "°C");
    add("socTemperature", "SoC temperature", temps.soc, "°C");
    temps.cpuDieTemps.forEach((value, i) => add(`cpuDie${i}`, `CPU die sensor ${i + 1}`, value, "°C"));
    temps.gpuDieTemps.forEach((value, i) => add(`gpuDie${i}`, `GPU die sensor ${i + 1}`, value, "°C"));
    } catch (error) {
      result.reason = macFailure(error);
    }
    native.fans().forEach((fan, i) => add(`fan${i}`, fan.label, fan.rpm, "rpm", "Fans"));
  } else {
    const native = require("osx-temperature-sensor") as { cpuTemperature(): { main: number; cores: number[] } };
    const temps = native.cpuTemperature();
    add("temperature", "CPU temperature", temps.main, "°C");
    temps.cores.forEach((value, i) => add(`cpuDie${i}`, `CPU temperature sensor ${i + 1}`, value, "°C"));
    const smc = require("osx-temperature-sensor/build/Release/smc") as { get(key: string): number };
    add("gpuTemperature", "GPU temperature", smc.get("TG0D"), "°C");
    const count = sensorNumber(smc.get("FNum")) ?? 0;
    for (let i = 0; i < Math.min(count, 16); i++) add(`fan${i}`, `Fan ${i + 1}`, smc.get(`F${i.toString(16).toUpperCase()}Ac`), "rpm", "Fans");
  }
  result.reason ??= "macOS did not expose this sensor. It may be absent (for example, fans on a fanless Mac) or unsupported by the driver.";
} catch (error) {
  result.reason = macFailure(error);
}
result.status = { state: result.readings.some((reading) => reading.value !== null) ? "ready" : "error", message: result.readings.some((reading) => reading.value !== null) ? "Native macOS sensor helper connected." : result.reason! };
return result;
}

export function macFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return /Cannot find module|NODE_MODULE_VERSION|dlopen|symbol not found/.test(message)
    ? "The native macOS sensor module is missing or incompatible. Reinstall the app for your Mac’s architecture; source builds must run npm run rebuild:native."
    : "macOS sensor access failed. The SMC/IOHID interface may be unavailable or access may be restricted.";
}

if (require.main === module) {
  if (process.argv.includes("--persistent")) {
    const input = createInterface({ input: process.stdin });
    input.on("line", (line) => {
      if (!/^\d+$/.test(line)) return;
      process.stdout.write(JSON.stringify({ ...collect(), protocol: 1, id: Number(line) }) + "\n");
    });
  } else process.stdout.write(JSON.stringify(collect()));
}
