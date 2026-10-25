import { renderOverview } from "./overview.js";
import { renderSensors } from "./sensors.js";
import { renderProcessor } from "./processor.js";
import { renderMemory } from "./memory.js";
import { renderGraphics } from "./graphics.js";
import { renderStorage } from "./storage.js";
import { renderNetwork } from "./network.js";

export const pages = [
  { id: "overview", title: "Overview", render: renderOverview },
  { id: "sensors", title: "Sensors", render: renderSensors },
  { id: "processor", title: "Processor", render: renderProcessor },
  { id: "memory", title: "Memory", render: renderMemory },
  { id: "graphics", title: "Graphics", render: renderGraphics },
  { id: "storage", title: "Storage", render: renderStorage },
  { id: "network", title: "Network", render: renderNetwork },
] as const;

export type Page = (typeof pages)[number];
