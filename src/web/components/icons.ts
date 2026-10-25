import { escapeHtml } from "../lib/dom.js";

const paths = {
  overview:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  sensors: '<path d="M2 13h5l3-8 4 15 3-7h5"/>',
  processor:
    '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" rx=".5"/><path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3"/>',
  memory:
    '<rect x="2" y="6" width="20" height="12" rx="1"/><path d="M6 10v4m4-4v4m4-4v4m4-4v4M6 18v3m4-3v3m4-3v3m4-3v3"/>',
  graphics: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  storage:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 14h18m-5 3h2"/><circle cx="12" cy="9" r="2"/>',
  network:
    '<path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0m-9 4a5 5 0 0 1 6 0"/><circle cx="12" cy="20" r=".8"/>',
  laptop:
    '<rect x="4" y="3" width="16" height="13" rx="1.5"/><path d="m4 16-2 4h20l-2-4M10 20h4"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
};

export type IconName = keyof typeof paths;

export function renderIcon(name: IconName, size = 17, className = ""): string {
  return `
    <svg
      class="${escapeHtml(className)}"
      width="${size}"
      height="${size}"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      ${paths[name]}
    </svg>
  `;
}
