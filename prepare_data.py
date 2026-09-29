"""Create the small Balochistan boundary file used by the local atlas."""
import json
from pathlib import Path
from urllib.request import urlopen

root = Path(__file__).parent
source = Path('/tmp/pak-districts-current.geojson')
if not source.exists():
    url = 'https://raw.githubusercontent.com/hibasameen/datadarbar/main/app/data/pakistan_districts_province_boundries.geojson'
    source.write_bytes(urlopen(url, timeout=30).read())
geo = json.loads(source.read_text())
data = json.loads((root / 'data/population.json').read_text())
by_map_name = {d.get('mapName', d['name']).casefold(): d for d in data['districts']}
aliases = {'chaghi': 'chagai', 'musakhail': 'musakhel', 'qilla abdullah': 'killa abdullah'}
features = []
for feature in geo['features']:
    props = feature.get('properties', {})
    if props.get('province_territory') != 'Balochistan':
        continue
    map_name = props.get('districts', '').strip()
    key = aliases.get(map_name.casefold(), map_name.casefold())
    row = by_map_name.get(key)
    if not row:
        continue
    features.append({
        'type': 'Feature',
        'properties': {
            'name': row['name'],
            'population': row['population'],
            'area': row['area'],
            'density': round(row['population'] / row['area']),
            'includes': row.get('includes', [row['name']]),
            'boundaryName': map_name,
        },
        'geometry': feature['geometry'],
    })
if len(features) != len(data['districts']):
    missing = sorted(set(d.get('mapName', d['name']) for d in data['districts']) - {f['properties']['boundaryName'] for f in features})
    raise SystemExit(f'Boundary match failed: {missing}')
total = sum(d['population'] for d in data['districts'])
if total != data['provincePopulation']:
    raise SystemExit(f'Population rows sum to {total:,}, expected {data["provincePopulation"]:,}')
(root / 'data/districts.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': features}, separators=(',', ':')))
print(f'Prepared {len(features)} map areas; population total {total:,}.')
