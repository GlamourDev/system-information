import type { BrowserWindowConstructorOptions } from "electron";

export type CloseAction = "hide" | "minimize" | "quit";

export function getWindowAppearance(
  platform: NodeJS.Platform,
  release: string,
  dark = true,
): BrowserWindowConstructorOptions {
  const backgroundColor = dark ? "#171b20" : "#f4f6f8";
  if (platform === "darwin") {
    return {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 20, y: 14 },
      transparent: true,
      vibrancy: "under-window",
      visualEffectState: "active",
      backgroundColor: "#00000000",
    };
  }

  if (platform === "win32") {
    const [major, , build] = release.split(".").map(Number);
    const supportsAcrylic = major > 10 || (major === 10 && build >= 22621);
    return {
      titleBarStyle: "hidden",
      titleBarOverlay: {
        color: backgroundColor,
        symbolColor: dark ? "#d3d8df" : "#303a43",
        height: 44,
      },
      autoHideMenuBar: true,
      transparent: false,
      backgroundColor: supportsAcrylic ? "#00000000" : backgroundColor,
      ...(supportsAcrylic ? { backgroundMaterial: "acrylic" } : {}),
    };
  }

  return {
    titleBarStyle: "default",
    autoHideMenuBar: true,
    transparent: false,
    backgroundColor,
  };
}

export function getCloseAction(platform: NodeJS.Platform, trayAvailable: boolean): CloseAction {
  if (!trayAvailable) return "quit";
  return platform === "linux" ? "minimize" : "hide";
}

export function getCloseLabel(platform: NodeJS.Platform, trayAvailable: boolean): string {
  if (!trayAvailable) return "Close";
  if (platform === "darwin") return "Close to Menu Bar";
  if (platform === "linux") return "Minimize to Taskbar";
  return "Close to Tray";
}
