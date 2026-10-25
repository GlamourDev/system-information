import type { HardwareAPI, MonitorSettings } from "../../types.js";
import { renderIcon } from "../components/icons.js";
import { getElement } from "../lib/dom.js";
import type { MonitorView } from "../model/types.js";
import { createReport } from "../report.js";

export function createControls(
  api: HardwareAPI,
  getView: () => MonitorView | null,
  onSettings: (settings: MonitorSettings) => void,
) {
  const pauseButton = getElement<HTMLButtonElement>("#pause");
  const intervalSelect = getElement<HTMLSelectElement>("#interval");
  const copyButton = getElement<HTMLButtonElement>("#copy");
  const status = getElement("#sample-state");
  const timestamp = getElement("#updated");
  let settings: MonitorSettings = { paused: false, interval: 2000 };
  let copyTimer: number | undefined;

  copyButton.innerHTML = `${renderIcon("copy", 14)}<span id="copy-label" aria-live="polite">Copy report</span>`;
  const copyLabel = getElement("#copy-label");

  pauseButton.addEventListener("click", async () => {
    const paused = await api.pause(!settings.paused);
    onSettings({ ...settings, paused });
  });

  intervalSelect.addEventListener("change", async () => {
    const value = Number(intervalSelect.value);
    if (value !== 1000 && value !== 2000 && value !== 5000) return;
    const interval = await api.interval(value);
    onSettings({ ...settings, interval });
  });

  copyButton.addEventListener("click", async () => {
    const view = getView();
    if (!view) return;
    await api.copy(createReport(api.info.name, view));
    copyLabel.textContent = "Copied";
    window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => {
      copyLabel.textContent = "Copy report";
    }, 2000);
  });

  return {
    update(nextSettings: MonitorSettings, lastUpdated: number | null) {
      settings = nextSettings;
      intervalSelect.value = String(settings.interval);
      pauseButton.innerHTML = renderIcon(settings.paused ? "play" : "pause", 13);
      pauseButton.title = settings.paused ? "Resume sampling" : "Pause sampling";
      pauseButton.setAttribute("aria-label", pauseButton.title);
      status.textContent = settings.paused ? "Paused" : "Updated";
      timestamp.textContent =
        lastUpdated === null
          ? "Waiting for sample"
          : new Date(lastUpdated).toLocaleTimeString([], { hour12: false });
    },
  };
}
