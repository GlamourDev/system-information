import { createSensorCsv } from "./report.js";
import { escapeHtml } from "./lib/dom.js";
import type { MonitorSettings } from "../types.js";
import { MonitorModel } from "./model/monitor.js";
import { createControls } from "./ui/controls.js";
import { createNavigation } from "./ui/navigation.js";
import { createShell } from "./ui/shell.js";
import { pages, type Page } from "./views/pages.js";

const api = window.hardware;
const monitor = new MonitorModel();
try {
  const threshold = Number(localStorage.getItem("temperatureAlert"));
  if (threshold >= 1 && threshold <= 200) monitor.temperatureAlert = threshold;
} catch { /* Preferences are optional when local storage is unavailable. */ }
const shell = createShell(api);
let selectedPage: Page = pages[0];
const controls = createControls(api, () => monitor.view, updateSettings);
const navigation = createNavigation(selectPage);

function render() {
  const view = monitor.view;
  if (!view) return;
  if (document.activeElement instanceof HTMLInputElement && document.activeElement.matches("[data-temperature-alert]")) return;
  const keys: Record<string, string[]> = { overview: ["system", "baseboard", "osInfo"], processor: ["cpu"], memory: ["memLayout"], graphics: ["graphics"], storage: ["diskLayout", "fsSize"], network: ["networkInterfaces"] };
  const issues = (keys[selectedPage.id] ?? []).filter((key) => view.hardware.issues?.[key]);
  const notice = issues.length ? `<div class="sensor-status">${issues.map((key) => `<p>${escapeHtml(key)}: ${escapeHtml(view.hardware.issues?.[key] ?? "")}</p>`).join("")}<button type="button" data-retry-sensors>Retry hardware detection</button></div>` : "";
  shell.showPage(selectedPage, notice + selectedPage.render(view));
  controls.update(monitor.settings, monitor.lastUpdated);
}

function selectPage(page: Page) {
  selectedPage = page;
  navigation.select(page);
  shell.resetScroll();
  render();
}

function updateSettings(settings: MonitorSettings) {
  monitor.setSettings(settings);
  if (monitor.view) controls.update(monitor.settings, monitor.lastUpdated);
}

api.onSample((sample) => {
  if (monitor.acceptSample(sample)) render();
});

api.onInventory((hardware) => {
  monitor.setHardware(hardware);
  shell.showHardware(hardware);
  render();
});

api.onSettings(updateSettings);
navigation.select(selectedPage);
controls.update(monitor.settings, monitor.lastUpdated);

api
  .bootstrap()
  .then((data) => {
    monitor.setHardware(data.hardware);
    monitor.setSettings(data);
    monitor.acceptSample(data.sample);
    shell.showHardware(data.hardware);
    render();
  })
  .catch(shell.showError);


document.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>("[data-retry-sensors]");
  if (!button) return;
  button.disabled = true;
  button.textContent = "Retrying…";
  try { await api.retrySensors(); }
  catch { button.textContent = "Retry failed — try again"; }
  finally { button.disabled = false; }
});


document.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>("[data-setup-sensors]");
  if (!button) return;
  button.disabled = true;
  try {
    await api.setupSensors();
    button.textContent = "Finish setup, then Retry sensors";
  } catch (error) {
    button.textContent = error instanceof Error ? error.message : "Could not start setup. Retry.";
  } finally { button.disabled = false; }
});


document.addEventListener("change", (event) => {
  if (!(event.target instanceof HTMLInputElement) || !event.target.matches("[data-temperature-alert]")) return;
  const value = Number(event.target.value);
  monitor.temperatureAlert = value >= 1 && value <= 200 ? value : null;
  try { localStorage.setItem("temperatureAlert", String(monitor.temperatureAlert ?? "")); } catch { /* Optional preference. */ }
  event.target.blur();
  render();
});
document.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>("[data-save-sensors]");
  const view = monitor.view;
  if (!button || !view) return;
  button.disabled = true;
  try { button.textContent = await api.saveSensorHistory(createSensorCsv(view)) ? "Saved" : "Save canceled"; }
  catch { button.textContent = "Could not save history"; }
  finally { button.disabled = false; }
});
