# Choropleth Map

A small, dependency-free JavaScript library for interactive GeoJSON choropleth maps. It draws responsive SVG maps, joins tabular values to GeoJSON features, adds hover details and keyboard-accessible selection, and can render a color legend. The included Balochistan Population Atlas is a complete example using public census and district boundary data.

## Quick start

Install directly from GitHub:

```sh
npm install github:safiullahasak/choropleth-map
```

Import the library and stylesheet in a browser app:

```js
import { ChoroplethMap } from 'choropleth-map';
import 'choropleth-map/style.css';

const map = new ChoroplethMap('#map', geojson, rows, {
  joinBy: 'district',
  dataKey: 'district',
  valueKey: 'population',
  labelKey: 'name',
  metricLabel: 'Population',
  colors: ['#e1ecd8', '#a8cda0', '#51956d', '#164f3b'],
  legend: '#legend',
  onSelect: ({ key, row }) => console.log('Selected:', key, row)
});
```

Your GeoJSON features need a property that matches a key in each data row. For example:

```js
// GeoJSON feature property
{ properties: { district: 'North' }, geometry: { /* Polygon or MultiPolygon */ } }

// Data row
{ district: 'North', name: 'North District', population: 125000, density: 42 }
```

The map fits the supplied features into its SVG viewBox. Put the target in a sized, positioned container (`position: relative`) for hover popups and use the provided CSS or customize it with the CSS variables below.

## Options

| Option | Default | Purpose |
| --- | --- | --- |
| `joinBy` | `id` | Feature property used to match rows |
| `dataKey` | `id` | Data row property used to match features |
| `valueKey` | `value` | Numeric property used to color the map |
| `labelKey` | — | Feature property used for labels and default popups |
| `colors` | Green color ramp | Low-to-high choropleth palette |
| `metricLabel` | `Value` | Metric title in tooltip and legend |
| `formatValue(value, row)` | Locale number | Format values in accessible labels, tooltip and legend |
| `width`, `height` | `1000`, `650` | SVG viewBox dimensions |
| `padding` | `32` | Space around the map geometry |
| `showLabels` | `false` | Show labels on features with enough room |
| `legend` | — | Legend element or selector |
| `onSelect(selection)` | — | Called on map selection; gets selection or `null` |
| `onHover(selection)` | — | Called on pointer/focus hover; gets selection or `null` |
| `renderTooltip(selection)` | — | Return a DOM node or text to customize hover content |

## API

- `map.setMetric(valueKey, metricLabel, formatValue)` updates the mapped value and legend.
- `map.select(key)` selects a feature by its GeoJSON join key.
- `map.clearSelection()` clears the selected feature.
- `map.destroy()` removes the map contents and tooltip.

Customize the map outline and interaction colors with CSS:

```css
.my-map {
  --choropleth-border: #f5f5f0;
  --choropleth-hover-stroke: #e4a62d;
  --choropleth-selected-stroke: #183c2d;
  --choropleth-focus-stroke: #3078be;
}
```

The library supports GeoJSON `Polygon` and `MultiPolygon` geometry and has no runtime dependencies. It is an SVG map renderer rather than a full GIS projection engine; it uses a simple longitude/latitude fit for regional maps.

## Run the included demo

```sh
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000). The demo includes Balochistan's population and density map, district search and profiles, and a responsive green theme.

### Demo data notes

- Population: Pakistan Bureau of Statistics, Population and Housing Census 2023, Table 1, Balochistan. The 31 rows in `data/population.json` sum to 14,894,402.
- Boundaries: public Pakistan administrative GeoJSON boundaries, clipped to Balochistan. The available outlines predate some district splits, so Chaman is combined with Killa Abdullah, Duki with Loralai, and Surab with Kalat. The demo calls out these combined map areas.
- Density is calculated from each map area's population divided by its summed census area.

## License

MIT. See [LICENSE](LICENSE).
