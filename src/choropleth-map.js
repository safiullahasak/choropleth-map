/**
 * Small dependency-free SVG choropleth map for GeoJSON Polygon/MultiPolygon data.
 * @license MIT
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const number = new Intl.NumberFormat('en-US');

/**
 * @typedef {Object} ChoroplethOptions
 * @property {string} [joinBy='id'] GeoJSON feature property used to match each row.
 * @property {string} [dataKey='id'] Data row property used to match each feature.
 * @property {string} [valueKey='value'] Numeric data row property to color by.
 * @property {string} [labelKey] Feature property shown on map and in the tooltip.
 * @property {Array<string>} [colors] Low-to-high color ramp.
 * @property {string} [metricLabel='Value'] Label shown in the tooltip and legend.
 * @property {(value:number, row:Object)=>string} [formatValue] Value formatter.
 * @property {number} [width=1000] SVG viewBox width.
 * @property {number} [height=650] SVG viewBox height.
 * @property {number} [padding=32] Inner map padding.
 * @property {boolean} [showLabels=false] Show labels for features with enough room.
 * @property {HTMLElement|string} [legend] Optional element or selector for a legend.
 * @property {(selection:Object|null)=>void} [onSelect] Called after selection changes.
 * @property {(hover:Object|null)=>void} [onHover] Called when hover changes.
 * @property {(selection:Object)=>Node|string|null} [renderTooltip] Optional tooltip content.
 */
export class ChoroplethMap {
  constructor(target, geojson, rows, options = {}) {
    this.container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!this.container) throw new Error('ChoroplethMap: map container was not found.');
    if (!geojson || !Array.isArray(geojson.features)) throw new Error('ChoroplethMap: expected a GeoJSON FeatureCollection.');
    if (!Array.isArray(rows)) throw new Error('ChoroplethMap: rows must be an array.');
    this.options = {
      joinBy: 'id', dataKey: 'id', valueKey: 'value', labelKey: undefined,
      colors: ['#e1ecd8','#c8dfbd','#a8cda0','#7fb486','#51956d','#26704f','#164f3b'],
      metricLabel: 'Value', formatValue: value => number.format(value),
      width: 1000, height: 650, padding: 32, showLabels: false,
      ...options
    };
    this.features = geojson.features;
    this.rows = rows;
    this.rowByKey = new Map(rows.map(row => [String(row[this.options.dataKey]), row]));
    this.selectedKey = null;
    this._createElements();
    this._draw();
  }

  _createElements() {
    this.svg = this.container.matches('svg') ? this.container : this.container.querySelector('svg');
    if (!this.svg) {
      this.svg = document.createElementNS(SVG_NS, 'svg');
      this.container.append(this.svg);
    }
    this.svg.classList.add('choropleth-map-svg');
    this.svg.setAttribute('role', 'img');
    this.svg.setAttribute('aria-label', 'Interactive choropleth map');
    this.tooltip = this.container.querySelector('[data-choropleth-tooltip]');
    if (!this.tooltip) {
      this.tooltip = document.createElement('div');
      this.tooltip.className = 'choropleth-tooltip';
      this.tooltip.dataset.choroplethTooltip = '';
      this.tooltip.setAttribute('aria-live', 'polite');
      this.container.append(this.tooltip);
    }
    const legendTarget = this.options.legend;
    this.legend = typeof legendTarget === 'string' ? document.querySelector(legendTarget) : legendTarget;
  }

  _coords(node, out = []) {
    if (!Array.isArray(node)) return out;
    if (typeof node[0] === 'number') out.push(node);
    else for (const child of node) this._coords(child, out);
    return out;
  }

  _prepareProjection() {
    const points = this.features.flatMap(feature => this._coords(feature.geometry.coordinates));
    if (!points.length) throw new Error('ChoroplethMap: no coordinates found in GeoJSON.');
    const xs = points.map(point => point[0]);
    const ys = points.map(point => -point[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const width = this.options.width, height = this.options.height, padding = this.options.padding;
    const scale = Math.min((width - padding * 2) / (maxX - minX), (height - padding * 2) / (maxY - minY));
    const offsetX = (width - (maxX - minX) * scale) / 2;
    const offsetY = (height - (maxY - minY) * scale) / 2;
    this.project = ([x, y]) => [offsetX + (x - minX) * scale, offsetY + (-y - minY) * scale];
  }

  _path(geometry) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    return polygons.map(polygon => polygon.map(ring => ring.map((point, index) => {
      const [x, y] = this.project(point);
      return `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ') + ' Z').join(' ')).join(' ');
  }

  _labelPoint(geometry) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    const ring = polygons.map(polygon => polygon[0]).sort((a, b) => Math.abs(this._area(b)) - Math.abs(this._area(a)))[0];
    let area = 0, cx = 0, cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1,y1] = ring[j], [x2,y2] = ring[i], cross = x1*y2-x2*y1;
      area += cross; cx += (x1+x2)*cross; cy += (y1+y2)*cross;
    }
    return Math.abs(area) < 1e-10 ? this.project(ring[0]) : this.project([cx/(3*area), cy/(3*area)]);
  }

  _area(ring) {
    let area = 0;
    for (let i=0,j=ring.length-1; i<ring.length; j=i++) area += ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];
    return area;
  }

  _record(feature) {
    return this.rowByKey.get(String(feature.properties?.[this.options.joinBy]));
  }

  _rankColors() {
    const values = this.features.map(feature => Number(this._record(feature)?.[this.options.valueKey])).filter(Number.isFinite).sort((a,b)=>a-b);
    const palette = this.options.colors;
    const result = new Map();
    this.features.forEach(feature => {
      const value = Number(this._record(feature)?.[this.options.valueKey]);
      const rank = values.indexOf(value);
      result.set(feature, Number.isFinite(value) && rank >= 0 ? palette[Math.min(palette.length-1, Math.floor(rank / Math.max(values.length, 1) * palette.length))] : '#d8ded8');
    });
    return values;
  }

  _draw() {
    this._prepareProjection();
    const values = this.features.map(feature => Number(this._record(feature)?.[this.options.valueKey])).filter(Number.isFinite).sort((a,b)=>a-b);
    this._colors = this._rankColorsMap();
    this.svg.setAttribute('viewBox', `0 0 ${this.options.width} ${this.options.height}`);
    this.svg.replaceChildren();
    this.features.forEach(feature => {
      const key = String(feature.properties?.[this.options.joinBy]);
      const row = this._record(feature);
      const label = this.options.labelKey ? (feature.properties?.[this.options.labelKey] ?? key) : key;
      const value = Number(row?.[this.options.valueKey]);
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', this._path(feature.geometry));
      path.setAttribute('fill', this._colors.get(feature));
      path.setAttribute('class', `choropleth-feature district-shape${this.selectedKey === key ? ' is-selected selected' : ''}`);
      path.setAttribute('tabindex', '0');
      path.setAttribute('role', 'button');
      path.setAttribute('aria-label', `${label}: ${this.options.formatValue(value, row)}`);
      path.addEventListener('pointermove', event => this._showTooltip({ key, label, value, row, feature }, event));
      path.addEventListener('pointerleave', () => this._hideTooltip());
      path.addEventListener('focus', () => this._showTooltip({ key, label, value, row, feature }, null, path));
      path.addEventListener('blur', () => this._hideTooltip());
      path.addEventListener('click', () => this.select(key));
      path.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.select(key); }
      });
      this.svg.append(path);
      if (this.options.showLabels) {
        const [x,y] = this._labelPoint(feature.geometry);
        const vertices = this._coords(feature.geometry.coordinates).map(this.project);
        const featureWidth = Math.max(...vertices.map(point=>point[0])) - Math.min(...vertices.map(point=>point[0]));
        const featureHeight = Math.max(...vertices.map(point=>point[1])) - Math.min(...vertices.map(point=>point[1]));
        if (featureWidth > String(label).length*5.1+8 && featureHeight > 15) {
          const text = document.createElementNS(SVG_NS, 'text');
          text.setAttribute('x', x); text.setAttribute('y', y); text.setAttribute('class', 'choropleth-label district-label'); text.textContent = label;
          this.svg.append(text);
        }
      }
    });
    this._renderLegend(values);
  }

  _rankColorsMap() {
    const values = this.features.map(feature => Number(this._record(feature)?.[this.options.valueKey])).filter(Number.isFinite).sort((a,b)=>a-b);
    const colors = new Map();
    this.features.forEach(feature => {
      const value = Number(this._record(feature)?.[this.options.valueKey]);
      const rank = values.indexOf(value);
      colors.set(feature, Number.isFinite(value) && rank >= 0 ? this.options.colors[Math.min(this.options.colors.length-1, Math.floor(rank / Math.max(values.length,1) * this.options.colors.length))] : '#d8ded8');
    });
    return colors;
  }

  _renderLegend(values) {
    if (!this.legend || !values.length) return;
    const colors = this.options.colors;
    const format = value => this.options.formatValue(value, {});
    this.legend.replaceChildren();
    const title = document.createElement('div'); title.className = 'choropleth-legend-title legend-head'; title.textContent = this.options.metricLabel.toUpperCase();
    const ramp = document.createElement('div'); ramp.className = 'choropleth-legend-ramp legend-ramp';
    colors.forEach(color => { const swatch = document.createElement('span'); swatch.style.backgroundColor = color; ramp.append(swatch); });
    const labels = document.createElement('div'); labels.className = 'choropleth-legend-labels legend-labels';
    const low = document.createElement('span'); low.textContent = format(values[0]);
    const high = document.createElement('span'); high.textContent = format(values.at(-1));
    labels.append(low, high); this.legend.append(title, ramp, labels);
  }

  _showTooltip(selection, event, focusedElement) {
    this.options.onHover?.(selection);
    const custom = this.options.renderTooltip?.(selection);
    if (custom instanceof Node) this.tooltip.replaceChildren(custom);
    else if (typeof custom === 'string') this.tooltip.textContent = custom;
    else {
      const heading = document.createElement('div'); heading.className = 'choropleth-tooltip-label'; heading.textContent = selection.label;
      const value = document.createElement('div'); value.className = 'choropleth-tooltip-value'; value.textContent = `${this.options.metricLabel}: ${this.options.formatValue(selection.value, selection.row)}`;
      this.tooltip.replaceChildren(heading, value);
    }
    this.tooltip.classList.add('is-visible', 'visible');
    const rect = this.container.getBoundingClientRect();
    if (event) {
      this.tooltip.style.left = `${Math.max(8, Math.min(event.clientX - rect.left + 16, rect.width - 230))}px`;
      this.tooltip.style.top = `${Math.max(8, Math.min(event.clientY - rect.top + 16, rect.height - 100))}px`;
    } else if (focusedElement) {
      const box = focusedElement.getBoundingClientRect();
      this.tooltip.style.left = `${Math.max(8, Math.min(box.left - rect.left + box.width / 2, rect.width - 230))}px`;
      this.tooltip.style.top = `${Math.max(8, Math.min(box.top - rect.top + box.height / 2, rect.height - 100))}px`;
    }
  }

  _hideTooltip() { this.tooltip.classList.remove('is-visible', 'visible'); this.options.onHover?.(null); }

  /** Change the choropleth's numeric field, optional formatter and legend label. */
  setMetric(valueKey, metricLabel = this.options.metricLabel, formatValue = this.options.formatValue) {
    this.options.valueKey = valueKey; this.options.metricLabel = metricLabel; this.options.formatValue = formatValue;
    this._draw();
    if (this.selectedKey !== null) this.select(this.selectedKey);
  }

  /** Select a feature by its GeoJSON join key. */
  select(key) {
    this.selectedKey = String(key);
    this.svg.querySelectorAll('.choropleth-feature').forEach((path, index) => {
      const selected = String(this.features[index].properties?.[this.options.joinBy]) === this.selectedKey;
      path.classList.toggle('is-selected', selected); path.classList.toggle('selected', selected);
    });
    const feature = this.features.find(item => String(item.properties?.[this.options.joinBy]) === this.selectedKey);
    const selection = feature ? { key: this.selectedKey, label: this.options.labelKey ? (feature.properties?.[this.options.labelKey] ?? this.selectedKey) : this.selectedKey, feature, row: this._record(feature) } : null;
    this.options.onSelect?.(selection);
    return selection;
  }

  clearSelection() {
    this.selectedKey = null;
    this.svg.querySelectorAll('.choropleth-feature').forEach(path => path.classList.remove('is-selected', 'selected'));
    this.options.onSelect?.(null);
  }

  destroy() {
    this.svg.replaceChildren(); this.tooltip.remove();
    if (!this.container.matches('svg') && !this.container.querySelector('svg').classList.contains('choropleth-map-svg')) this.svg.remove();
  }
}

export default ChoroplethMap;
