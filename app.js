import { ChoroplethMap } from './src/choropleth-map.js';

const fmt = new Intl.NumberFormat('en-US');
const shortFmt = value => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)}M` : value >= 100_000 ? `${(value / 1_000).toFixed(0)}K` : fmt.format(value);
const divisionFor = name => {
  const n = name.toLowerCase();
  if (n.includes('awaran')) return 'KALAT DIVISION';
  if (['kharan','nushki','washuk','chagai'].some(x => n.includes(x))) return 'RAKHSHAN DIVISION';
  if (['gwadar','kech','panjgur'].some(x => n.includes(x))) return 'MAKRAN DIVISION';
  if (['dera bugti','harnai','nasirabad','jaffarabad','jhal magsi','kachhi','sibi','sohbatpur'].some(x => n.includes(x))) return 'NASIRABAD / SIBI DIVISION';
  if (['zhob','sherani','musakhel','killa saifullah','loralai','barkhan'].some(x => n.includes(x))) return 'LORALAI / ZHOB DIVISION';
  if (['quetta','pishin','killa abdullah'].some(x => n.includes(x))) return 'QUETTA DIVISION';
  if (['kalat','surab','khuzdar','mastung','lasbela','hub'].some(x => n.includes(x))) return 'KALAT DIVISION';
  return 'BALOCHISTAN';
};

async function startAtlas() {
  const [dataResponse, boundaryResponse] = await Promise.all([fetch('./data/population.json'), fetch('./data/districts.geojson')]);
  if (!dataResponse.ok || !boundaryResponse.ok) throw new Error('Could not load the local map data. Start a local web server and reload.');
  const data = await dataResponse.json();
  const geo = await boundaryResponse.json();
  const sorted = [...data.districts].sort((a,b) => b.population-a.population);
  const rowByName = new Map(data.districts.map(row => [row.name, row]));
  const list = document.querySelector('#districtList');
  const search = document.querySelector('#districtSearch');
  let map;

  function renderList(selectedName = null) {
    const query = search.value.trim().toLowerCase();
    const visible = sorted.filter(row => row.name.toLowerCase().includes(query));
    list.innerHTML = visible.map((row,i) => `<button class="district-row${selectedName===row.name?' selected':''}" data-name="${row.name}"><span class="row-rank">${String(i+1).padStart(2,'0')}</span><span class="row-name">${row.name}</span><span class="row-value">${shortFmt(row.population)}</span><span class="row-state">${selectedName===row.name?'✓':''}</span></button>`).join('');
    list.querySelectorAll('.district-row').forEach(button => button.addEventListener('click', () => map.select(button.dataset.name)));
    document.querySelector('#districtCount').textContent = `${visible.length} areas`;
  }

  function updateProfile(selection) {
    if (!selection) {
      document.querySelector('#profileContent').classList.add('hidden');
      document.querySelector('#profileEmpty').classList.remove('hidden');
      renderList();
      return;
    }
    const row = rowByName.get(selection.key);
    if (!row) return;
    document.querySelector('#profileEmpty').classList.add('hidden');
    const profile = document.querySelector('#profileContent');
    profile.classList.remove('hidden');
    document.querySelector('#profileName').textContent = row.name;
    document.querySelector('#profilePopulation').textContent = fmt.format(row.population);
    document.querySelector('#profileDensity').textContent = fmt.format(Math.round(row.population/row.area));
    document.querySelector('#profileArea').textContent = fmt.format(row.area);
    document.querySelector('#profileDivision').textContent = divisionFor(row.name);
    document.querySelector('#profileIndex').textContent = `${String(sorted.findIndex(item=>item.name===row.name)+1).padStart(2,'0')} / ${sorted.length}`;
    const share = row.population/data.provincePopulation*100;
    document.querySelector('#profileShare').textContent = `${share.toFixed(1)}%`;
    document.querySelector('#shareBar').style.width = `${Math.max(share,2)}%`;
    document.querySelector('#profileFootnote').textContent = row.includes?.length>1 ? `Combined census area: ${row.includes.join(' + ')}.` : '';
    profile.classList.remove('profile-reveal'); void profile.offsetWidth; profile.classList.add('profile-reveal');
    renderList(row.name);
    list.querySelector('.district-row.selected')?.scrollIntoView({block:'nearest',behavior:'smooth'});
  }

  map = new ChoroplethMap('#mapStage', geo, data.districts, {
    joinBy: 'name', dataKey: 'name', valueKey: 'population', labelKey: 'mapName',
    metricLabel: 'Population', legend: '#mapLegend', showLabels: true,
    width: 1200, height: 760, padding: 48,
    colors: ['#e1ecd8','#c8dfbd','#a8cda0','#7fb486','#51956d','#26704f','#164f3b'],
    formatValue: value => fmt.format(value),
    renderTooltip: ({key, row}) => {
      const card = document.createElement('div'); card.className = 'hover-tooltip-content';
      const kicker = document.createElement('div'); kicker.className = 'hover-kicker'; kicker.innerHTML = '<span></span>POPULATION · CENSUS 2023';
      const name = document.createElement('div'); name.className = 'map-hover-name'; name.textContent = key;
      const value = document.createElement('div'); value.className = 'map-hover-value'; value.textContent = fmt.format(row.population);
      const divider = document.createElement('div'); divider.className = 'hover-divider';
      const meta = document.createElement('div'); meta.className = 'hover-meta';
      const residents = document.createElement('span'); residents.textContent = `${shortFmt(row.population)} residents`;
      const share = document.createElement('span'); share.textContent = `${(row.population/data.provincePopulation*100).toFixed(1)}% of province`;
      meta.append(residents, share); card.append(kicker, name, value, divider, meta); return card;
    },
    onSelect: updateProfile
  });

  document.querySelector('#totalPopulation').textContent = fmt.format(data.provincePopulation);
  document.querySelectorAll('.view-button').forEach(button => button.addEventListener('click', () => {
    const density = button.dataset.mode === 'density';
    document.querySelectorAll('.view-button').forEach(item => item.classList.toggle('active', item === button));
    map.setMetric(density ? 'density' : 'population', density ? 'Population density' : 'Population', value => density ? `${fmt.format(value)} / km²` : shortFmt(value));
  }));
  search.addEventListener('input', () => renderList(map.selectedKey));
  document.querySelector('#clearSelection').addEventListener('click', () => map.clearSelection());
  document.querySelector('#sourceButton').addEventListener('click', () => document.querySelector('#sourceDialog').showModal());
  document.querySelector('#closeDialog').addEventListener('click', () => document.querySelector('#sourceDialog').close());
  document.querySelector('#sourceDialog').addEventListener('click', event => { if(event.target===event.currentTarget) event.currentTarget.close(); });
  document.addEventListener('keydown', event => { if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();search.focus();} });

  const topFive = sorted.slice(0,5).reduce((sum,row)=>sum+row.population,0);
  const densest = [...data.districts].sort((a,b)=>b.population/b.area-a.population/a.area)[0];
  document.querySelector('#largestArea').innerHTML = `${sorted[0].name} <i>·</i> ${shortFmt(sorted[0].population)}`;
  document.querySelector('#densestArea').innerHTML = `${densest.name} <i>·</i> ${fmt.format(Math.round(densest.population/densest.area))} / km²`;
  document.querySelector('#topFiveShare').textContent = `${(100*topFive/data.provincePopulation).toFixed(1)}% of province`;
  renderList();
}

startAtlas().catch(error => {
  console.error(error);
  document.querySelector('#mapStage').innerHTML = '<div class="load-error"><strong>Map data could not load.</strong><br>Start the local web server and reload this page.</div>';
});
