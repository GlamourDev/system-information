import type { TableRow } from "../model/types.js";
import { escapeHtml } from "../lib/dom.js";
import { isFiniteNumber } from "../lib/format.js";

export function renderHeading(title: string, detail = ""): string {
  return `
    <div class="section-heading">
      <h2 class="section-heading__title">${escapeHtml(title)}</h2>
      <span class="section-heading__detail">${escapeHtml(detail)}</span>
    </div>
  `;
}

export function renderTable(rows: readonly TableRow[]): string {
  const content = rows
    .map(
      ([label, value]) => `
    <tr class="hardware-table__row">
      <th class="hardware-table__label" scope="row">${escapeHtml(label)}</th>
      <td class="hardware-table__value">${escapeHtml(value === "" || value == null ? "—" : value)}</td>
    </tr>
  `,
    )
    .join("");

  return `
    <table class="hardware-table">
      <tbody>${content}</tbody>
    </table>
  `;
}

export function renderSection(title: string, rows: readonly TableRow[], detail = ""): string {
  return `
    ${renderHeading(title, detail)}
    ${renderTable(rows)}
  `;
}

export function renderCapacityBar(percent: unknown, compact = false): string {
  const width = Math.max(0, Math.min(100, isFiniteNumber(percent) ? percent : 0));
  const className = compact ? "capacity-bar capacity-bar--compact" : "capacity-bar";
  return `
    <svg class="${className}" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true">
      <rect width="100" height="4" fill="var(--bar-track)" />
      <rect width="${width}" height="4" fill="var(--bar-fill)" />
    </svg>
  `;
}
