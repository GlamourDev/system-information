import type { HardwareAPI, HardwareInventory } from "../../types.js";
import { renderIcon } from "../components/icons.js";
import { escapeHtml, getElement } from "../lib/dom.js";
import { formatBytes } from "../lib/format.js";
import type { Page } from "../views/pages.js";

export function createShell(api: HardwareAPI) {
  const title = getElement("#section-title");
  const content = getElement("#content");
  const status = getElement("#sample-state");
  const machineName = getElement("#machine-name");
  const machineDetail = getElement("#machine-detail");
  const platform = getElement("#platform-label");

  document.body.classList.add(`app--${api.platform}`);
  document.title = api.info.name;
  getElement("#app-name").textContent = api.info.name;
  getElement("#machine-icon").innerHTML = renderIcon("laptop", 20);

  return {
    showHardware(hardware: HardwareInventory) {
      machineName.textContent = hardware.system?.model || "This computer";
      machineDetail.textContent = [hardware.cpu?.brand, formatBytes(hardware.totalMemory, 0)]
        .filter(Boolean)
        .join(" · ");
      platform.textContent = [hardware.osInfo?.distro, hardware.osInfo?.release]
        .filter(Boolean)
        .join(" ");
    },
    showPage(page: Page, markup: string) {
      const scrollPosition = content.scrollTop;
      title.textContent = page.title;
      content.innerHTML = markup;
      content.scrollTop = scrollPosition;
    },
    resetScroll() {
      content.scrollTop = 0;
    },
    showError(error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      content.innerHTML = `<div class="empty-state">Could not read hardware information.<br>${escapeHtml(message)}</div>`;
      status.textContent = "Connection failed";
    },
  };
}
