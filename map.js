//Import Mapbox as an ESM module

import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';


// Check that Mapbox GL JS is loaded
console.log('Mapbox GL JS Loaded:', mapboxgl);

// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiamFhbWFybyIsImEiOiJjbXdpeTB5YTIwajltMnlxNDFveTBydXE1In0.5L6_JX4ri2KpuK_8kwGaCg';


// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/satellite-streets-v12', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18, // Maximum allowed zoom
});

//bike lane styling
const bikeLaneStyle = {
  'line-color': 'limegreen',
  'line-width': 5,
  'line-opacity': 0.6,
};

// Step 3.3: convert a station's lon/lat to pixel coordinates on the map.
// Global so it can be reused whenever the map pans/zooms.
function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
    const { x, y } = map.project(point); // Project to pixel coordinates
    return { cx: x, cy: y }; // Return as object for use in SVG attributes
}
  
map.on('load', async () => {
  // --- Bike lanes ---
  map.addSource('boston_route', {
    type: 'geojson',
    data: 'data/Existing_Bike_Network_2022.geojson',
  });
  map.addLayer({
    id: 'bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: bikeLaneStyle,
  });

  map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'data/cambridge_bike_network.geojson',
  });
  map.addLayer({
    id: 'cambridge-lanes',
    type: 'line',
    source: 'cambridge_route',
    paint: bikeLaneStyle,
  });

  // fetch + parse station JSON
  let jsonData;
  try {
    const jsonurl = 'https://dsc-courses.github.io/dsc209r-2025-fa/labs/lab07/data/bluebikes-stations.json';
    jsonData = await d3.json(jsonurl);
    console.log('Loaded JSON Data:', jsonData);
  } catch (error) {
    console.error('Error loading JSON:', error);
  }

  let stations = jsonData.data.stations;
  console.log('Stations Array:', stations);

  // --- Step 4.1: import + parse trip data (~260k rows, may take a few seconds) ---
  const trips = await d3.csv(
    'https://dsc-courses.github.io/dsc209r-2025-fa/labs/lab07/data/bluebikes-traffic-2024-03.csv',
  );
  console.log('Loaded trips:', trips.length);

  // --- Step 4.2: departures / arrivals / total traffic per station ---
  const departures = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.start_station_id,
  );
  const arrivals = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.end_station_id,
  );

  stations = stations.map((station) => {
    let id = station.short_name;
    station.arrivals = arrivals.get(id) ?? 0;
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });
  console.log('Stations with traffic:', stations);

  // --- Step 4.3: size circles by AREA (sqrt scale) ---
  const radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(stations, (d) => d.totalTraffic)])
    .range([0, 25]);

  // --- Step 3.3 / 4.4: one circle per station, with tooltip ---
  const svg = d3.select('#map').select('svg');

  const circles = svg
    .selectAll('circle')
    .data(stations)
    .enter()
    .append('circle')
    .attr('r', (d) => radiusScale(d.totalTraffic))
    .each(function (d) {
      // <title> gives a native browser tooltip
      d3.select(this)
        .append('title')
        .text(
          `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`,
        );
    });

  // Reposition circles to match the map's current view
  function updatePositions() {
    circles
      .attr('cx', (d) => getCoords(d).cx)
      .attr('cy', (d) => getCoords(d).cy);
  }

  updatePositions();

  map.on('move', updatePositions);
  map.on('zoom', updatePositions);
  map.on('resize', updatePositions);
  map.on('moveend', updatePositions);
});
