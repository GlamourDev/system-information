import { renderIcon, type IconName } from "../components/icons.js";
import { thermalLayout } from "../model/thermals.js";
import { escapeHtml } from "../lib/dom.js";
import { formatSensor, formatNumber, isFiniteNumber } from "../lib/format.js";
import type { MonitorView, SensorReading, SensorStatistics } from "../model/types.js";

// Display bands are a visual guide, not device-specific thermal limits.
function temperatureValue(value: unknown, unit: SensorReading["unit"], compact = false): string {
  const text = compact && isFiniteNumber(value) && unit === "°C"
    ? `${formatNumber(value, 0)} °C` : formatSensor(value, unit);
  if (unit !== "°C" || !isFiniteNumber(value)) return text;
  const band = value >= 90 ? "very-hot" : value >= 80 ? "hot" : value >= 60 ? "warm" : "cool";
  const label = band === "very-hot" ? "Very hot" : band[0].toUpperCase() + band.slice(1);
  return `<span class="temperature-value temperature-value--${band}" title="${label} · visual guide" aria-label="${escapeHtml(`${text}, ${label}`)}">${text}</span>`;
}

function renderReading(reading: SensorReading, statistics: SensorStatistics | undefined, view: MonitorView): string {
  const unavailable = isFiniteNumber(reading.value) ? "" : "sensor-table__cell--unavailable";
  const average = statistics ? statistics.sum / statistics.count : null;

  const history = view.sensorHistory ?? [];
  const end = history.at(-1)?.at ?? 0;
  const values = history.map((point) => ({ at: point.at, value: point.readings.find((item) => item.id === reading.id)?.value ?? null }));
  const valid = values.map((point) => point.value).filter((value): value is number => value !== null);
  const low = Math.min(...valid);
  const span = Math.max(1, Math.max(...valid) - low);
  let connected = false;
  const path = values.map((point) => {
    if (point.value === null) { connected = false; return ""; }
    const x = Math.max(0, (point.at - end + 120000) / 120000 * 90);
    const y = 23 - (point.value - low) / span * 20;
    const segment = `${connected ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    connected = true;
    return segment;
  }).join(" ");
  return `
    <tr class="sensor-table__row">
      <td class="sensor-table__cell" title="${escapeHtml([reading.name, reading.source].filter(Boolean).join(" · "))}">
        ${escapeHtml(reading.name)}
        ${reading.reason ? `<small class="sensor-table__reason">${escapeHtml(reading.reason)}</small>` : ""}

      </td>
      <td class="sensor-table__cell sensor-table__cell--current ${unavailable}">
        ${temperatureValue(reading.value, reading.unit)}
      </td>
      <td class="sensor-table__cell">${temperatureValue(statistics?.min, reading.unit)}</td>
      <td class="sensor-table__cell">${temperatureValue(statistics?.max, reading.unit)}</td>
      <td class="sensor-table__cell">${temperatureValue(average, reading.unit)}</td>
      <td class="sensor-table__cell"><svg viewBox="0 0 90 26" width="90" height="26" role="img" aria-label="${escapeHtml(reading.name)} trend over two minutes"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.5" /></svg></td>
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
          <td class="sensor-table__group-label" colspan="6">${escapeHtml(currentGroup)}</td>
        </tr>
      `);
    }
    rows.push(renderReading(reading, view.statistics.get(reading.id), view));
  }

  const thermal = thermalLayout(view.sensors);
  const tile = (reading: SensorReading) => {
    const icon: IconName = reading.unit === "rpm" ? "fan" : reading.name === "GPU" ? "gpu" : reading.name === "CPU" || reading.name === "Chip" ? "processor" : "temperature";
    const name = reading.name.replace(/^(CPU|GPU) die sensor /, "$1 sensor ");
    const value = temperatureValue(reading.value, reading.unit, true);
    const fan = reading.unit === "rpm" ? ` data-fan-id="${escapeHtml(reading.id)}" data-fan-rpm="${isFiniteNumber(reading.value) ? reading.value : ""}"` : "";
    return `<div class="thermal-tile"><span class="thermal-tile__icon"${fan}>${renderIcon(icon, 20)}</span><span class="thermal-tile__name">${escapeHtml(name)}</span><strong>${value}</strong>${reading.reason ? `<details class="thermal-tile__reason" data-sensor-disclosure="reason-${escapeHtml(reading.id)}"><summary>Why unavailable?</summary><small>${escapeHtml(reading.reason)}</small></details>` : ""}</div>`;
  };
  const coreGroups = [...new Set(thermal.cores.map((reading) => reading.group))];
  const coreMarkup = coreGroups.map((group) => `${coreGroups.length > 1 ? `<h3>${escapeHtml(group)}</h3>` : ""}<div class="thermal-grid thermal-grid--cores">${thermal.cores.filter((reading) => reading.group === group).map(tile).join("")}</div>`).join("");
  const status = view.sample?.extendedSensors?.status;
  const hot = view.temperatureAlert == null ? [] : view.sensors.filter((reading) => reading.unit === "°C" && reading.value !== null && reading.value >= view.temperatureAlert!);
  return `
    ${status && status.state !== "ready" ? `<div class="sensor-status" role="status"><strong>Sensor access: ${escapeHtml(status.state)}</strong><p>${escapeHtml(status.message)}</p>${status.setupRequired ? '<button type="button" data-setup-sensors>Set up hardware sensors</button>' : ""}<button type="button" data-retry-sensors>Retry sensors</button></div>` : ""}
    <section class="thermal-overview" aria-label="Temperatures">
      <h2>${renderIcon("temperature", 16)} Temperatures</h2>
      <p class="temperature-legend" aria-label="Temperature color guide" title="General visual guide; actual thermal limits vary by device.">
        <span class="temperature-value--cool">Cool &lt;60°</span>
        <span class="temperature-value--warm">Warm 60–79°</span>
        <span class="temperature-value--hot">Hot 80–89°</span>
        <span class="temperature-value--very-hot">Very hot 90°+</span>
      </p>
      <div class="thermal-grid">${thermal.summary.map(tile).join("")}</div>
      ${thermal.cores.length ? `<h3>CPU cores</h3>${coreMarkup}` : ""}
      ${thermal.fans.length ? `<h3>${renderIcon("fan", 16)} Cooling</h3><div class="thermal-grid thermal-grid--cores">${thermal.fans.map(tile).join("")}</div>` : ""}
    </section>
    ${hot.length ? `<p role="alert">${hot.length} temperature readings exceed your ${view.temperatureAlert} °C threshold.</p>` : ""}
    <details class="sensor-disclosure sensor-disclosure--advanced" data-sensor-disclosure="advanced"><summary>${renderIcon("sliders", 16)} More details</summary>
    ${thermal.details.length ? `<details class="sensor-disclosure" data-sensor-disclosure="temperatures"><summary>Temperature sensors (${thermal.details.length})</summary><p class="help-text">These chip sensors do not necessarily map to individual CPU cores.</p><div class="thermal-grid thermal-grid--cores">${thermal.details.map(tile).join("")}</div></details>` : ""}
    <details class="sensor-disclosure" data-sensor-disclosure="options"><summary>Alerts and export</summary>
    <div class="sensor-status"><label>Temperature alert (°C, blank disables): <input data-temperature-alert type="number" min="1" max="200" value="${view.temperatureAlert ?? ""}" /></label> <button type="button" data-save-sensors>Save last 2 minutes as CSV</button></div>
    </details>
    <details class="sensor-disclosure" data-sensor-disclosure="statistics"><summary>All readings (${view.sensors.length})</summary>
    <table class="sensor-table">
      <thead class="sensor-table__head">
        <tr class="sensor-table__row">
          <th class="sensor-table__heading">Sensor</th>
          <th class="sensor-table__heading">Current</th>
          <th class="sensor-table__heading">Minimum</th>
          <th class="sensor-table__heading">Maximum</th>
          <th class="sensor-table__heading">Average</th>
          <th class="sensor-table__heading">2 min trend</th>
        </tr>
      </thead>
      <tbody>${rows.join("")}</tbody>
    </table>
    ${view.sensors.length ? "" : '<div class="empty-state">No sensor readings</div>'}
    <p class="sensor-table__help">— Sensor unavailable. Min, max and average since launch.</p>
    </details>
    </details>
  `;
}
