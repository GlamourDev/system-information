import type { GraphSeries, HistoryPoint } from "../model/types.js";
import { escapeHtml } from "../lib/dom.js";
import { isFiniteNumber } from "../lib/format.js";

interface ChartOptions {
  title: string;
  value: string;
  history: readonly HistoryPoint[];
  series: GraphSeries;
  max?: number | null;
}

interface Coordinate {
  x: number;
  y: number;
}

const historyDuration = 120000;
const plotWidth = 360;
const baseline = 78;
const plotHeight = 72;

export function renderChart({ title, value, history, series, max = 100 }: ChartOptions): string {
  const end = history.at(-1)?.at ?? Date.now();
  const start = end - historyDuration;
  const samples = history.filter((point) => point.at >= start && isFiniteNumber(point[series]));
  const values = samples.map((point) => point[series] ?? 0);
  const limit = isFiniteNumber(max) && max > 0 ? max : Math.max(1024, ...values) * 1.15;
  const coordinates: Coordinate[] = samples.map((point) => ({
    x: Math.max(0, Math.min(plotWidth, ((point.at - start) / historyDuration) * plotWidth)),
    y: baseline - (Math.max(0, Math.min(limit, point[series] ?? 0)) / limit) * plotHeight,
  }));
  const points = coordinates
    .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
  const first = coordinates[0];
  const last = coordinates.at(-1);
  const fill =
    first && last && coordinates.length > 1
      ? `
    <polygon class="chart__fill" points="${first.x},${baseline} ${points} ${last.x},${baseline}" />
  `
      : "";
  const endpoint = last
    ? `
    <circle class="chart__dot" cx="${last.x}" cy="${last.y}" r="2" />
  `
    : "";

  return `
    <div class="chart">
      <div class="chart__header">
        <span>${escapeHtml(title)}</span>
        <strong class="chart__value">${escapeHtml(value)}</strong>
      </div>
      <svg
        class="chart__plot"
        viewBox="0 0 360 84"
        preserveAspectRatio="none"
        role="img"
        aria-label="${escapeHtml(title)} over the last two minutes"
      >
        <path class="chart__grid" d="M0 6H360M0 42H360M0 78H360M90 0V84M180 0V84M270 0V84" />
        ${fill}
        <polyline class="chart__line" points="${points}" />
        ${endpoint}
      </svg>
      <div class="chart__axis">
        <span>2 min</span>
        <span>now</span>
      </div>
    </div>
  `;
}
