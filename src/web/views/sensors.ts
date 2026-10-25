import { escapeHtml } from "../lib/dom.js";
import { formatSensor, isFiniteNumber } from "../lib/format.js";
import type { MonitorView, SensorReading, SensorStatistics } from "../model/types.js";

function renderReading(reading: SensorReading, statistics: SensorStatistics | undefined): string {
  const unavailable = isFiniteNumber(reading.value) ? "" : "sensor-table__cell--unavailable";
  const average = statistics ? statistics.sum / statistics.count : null;

  return `
    <tr class="sensor-table__row">
      <td class="sensor-table__cell" title="${escapeHtml(reading.name)}">
        ${escapeHtml(reading.name)}
      </td>
      <td class="sensor-table__cell sensor-table__cell--current ${unavailable}">
        ${formatSensor(reading.value, reading.unit)}
      </td>
      <td class="sensor-table__cell">${formatSensor(statistics?.min, reading.unit)}</td>
      <td class="sensor-table__cell">${formatSensor(statistics?.max, reading.unit)}</td>
      <td class="sensor-table__cell">${formatSensor(average, reading.unit)}</td>
    </tr>
  `;
}

export function renderSensors(view: MonitorView): string {
  let currentGroup = "";
  const rows: string[] = [];

  for (const reading of view.sensors) {
    if (reading.group !== currentGroup) {
      currentGroup = reading.group;
      rows.push(`
        <tr class="sensor-table__group">
          <td class="sensor-table__group-label" colspan="5">${escapeHtml(currentGroup)}</td>
        </tr>
      `);
    }
    rows.push(renderReading(reading, view.statistics.get(reading.id)));
  }

  return `
    <table class="sensor-table">
      <thead class="sensor-table__head">
        <tr class="sensor-table__row">
          <th class="sensor-table__heading">Sensor</th>
          <th class="sensor-table__heading">Current</th>
          <th class="sensor-table__heading">Minimum</th>
          <th class="sensor-table__heading">Maximum</th>
          <th class="sensor-table__heading">Average</th>
        </tr>
      </thead>
      <tbody>${rows.join("")}</tbody>
    </table>
    ${view.sensors.length ? "" : '<div class="empty-state">No sensor readings</div>'}
    <p class="sensor-table__help">— Sensor unavailable. Min, max and average since launch.</p>
  `;
}
