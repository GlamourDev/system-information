import type { MonitorSettings } from "../types.js";
import { MonitorModel } from "./model/monitor.js";
import { createControls } from "./ui/controls.js";
import { createNavigation } from "./ui/navigation.js";
import { createShell } from "./ui/shell.js";
import { pages, type Page } from "./views/pages.js";

const api = window.hardware;
const monitor = new MonitorModel();
const shell = createShell(api);
let selectedPage: Page = pages[0];
const controls = createControls(api, () => monitor.view, updateSettings);
const navigation = createNavigation(selectPage);

function render() {
  const view = monitor.view;
  if (!view) return;
  shell.showPage(selectedPage, selectedPage.render(view));
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
