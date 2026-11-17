// ============================================================
// LAB 7: Geospatial Visualizations (Bikewatching)
// ============================================================

// ---------- Step 1.1: Add Mapbox GL JS (ES module) + Step 3: D3 ----------
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Check that Mapbox GL JS is loaded
console.log('Mapbox GL JS Loaded:', mapboxgl);

// ---------- Step 1.3: Create the Map ----------
// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiamFhbWFybyIsImEiOiJjbXdpeTB5YTIwajltMnlxNDFveTBydXE1In0.5L6_JX4ri2KpuK_8kwGaCg';

const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/satellite-streets-v12', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18, // Maximum allowed zoom
});

// ---------- Step 2.3 (Going Further): shared bike lane styling ----------
const bikeLaneStyle = {
  'line-color': '#32D400',
  'line-width': 5,
  'line-opacity': 0.6,
};

// ---------- Step 5.4: Performance optimization (1440 minute "buckets") ----------
// Index = minute of the day. Each bucket holds the trips that started/ended then.
let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

// ---------- Step 3.3: Helper to convert lon/lat -> pixel coordinates ----------
// Global so it can be used during pan/zoom updates.
function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
  const { x, y } = map.project(point); // Project to pixel coordinates
  return { cx: x, cy: y }; // Return as object for use in SVG attributes
}

// ---------- Step 5.2: Format minutes since midnight as HH:MM AM/PM ----------
function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes); // Set hours & minutes
  return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
}

// ---------- Step 5.3: Minutes since midnight for a Date ----------
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// ---------- Step 5.4: Retrieve trips within +/- 60 min of a minute (wraps at midnight) ----------
function filterByMinute(tripsByMinute, minute) {
  if (minute === -1) {
    return tripsByMinute.flat(); // No filtering, return all trips
  }

  // Normalize both min and max minutes to the valid range [0, 1439]
  let minMinute = (minute - 60 + 1440) % 1440;
  let maxMinute = (minute + 60) % 1440;

  // Handle time filtering across midnight
  if (minMinute > maxMinute) {
    let beforeMidnight = tripsByMinute.slice(minMinute);
    let afterMidnight = tripsByMinute.slice(0, maxMinute);
    return beforeMidnight.concat(afterMidnight).flat();
  } else {
    return tripsByMinute.slice(minMinute, maxMinute).flat();
  }
}

// ---------- Step 4.2 + 5.3 + 5.4: Arrivals, departures, total traffic per station ----------
// (Step 5.3 refactored this into a function; Step 5.4 made it use the minute buckets.)
function computeStationTraffic(stations, timeFilter = -1) {
  // Departures (Step 4.2)
  const departures = d3.rollup(
    filterByMinute(departuresByMinute, timeFilter), // Efficient retrieval
    (v) => v.length,
    (d) => d.start_station_id,
  );

  // Arrivals (Step 4.2)
  const arrivals = d3.rollup(
    filterByMinute(arrivalsByMinute, timeFilter), // Efficient retrieval
    (v) => v.length,
    (d) => d.end_station_id,
  );

  // Update each station with arrivals, departures, totalTraffic
  return stations.map((station) => {
    let id = station.short_name;
    station.arrivals = arrivals.get(id) ?? 0;
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });
}

// ---------- Step 2.1: Wait for the map to load before adding data ----------
map.on('load', async () => {
  // ---------- Step 2.1 / 2.2: Boston bike lanes (addSource + addLayer) ----------
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

  // ---------- Step 2.3: Cambridge bike lanes ----------
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

  // ---------- Step 3.1: Fetch and parse the station JSON ----------
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

  // ---------- Step 4.1 + 5.3 + 5.4: Import trips, parse dates, fill minute buckets ----------
  let trips = await d3.csv(
    'https://dsc-courses.github.io/dsc209r-2025-fa/labs/lab07/data/bluebikes-traffic-2024-03.csv',
    (trip) => {
      // Step 5.3: strings -> Date objects
      trip.started_at = new Date(trip.started_at);
      trip.ended_at = new Date(trip.ended_at);

      // Step 5.4: add trip to its departure / arrival minute bucket
      let startedMinutes = minutesSinceMidnight(trip.started_at);
      departuresByMinute[startedMinutes].push(trip);
      let endedMinutes = minutesSinceMidnight(trip.ended_at);
      arrivalsByMinute[endedMinutes].push(trip);

      return trip;
    },
  );
  console.log('Loaded trips:', trips.length);

  // ---------- Step 4.2: Station traffic (replaces raw stations from Step 3.1) ----------
  stations = computeStationTraffic(stations);
  console.log('Stations with traffic:', stations);

  // ---------- Step 4.3: Square-root scale so circle AREA encodes traffic ----------
  const radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(stations, (d) => d.totalTraffic)])
    .range([0, 25]);

  // ---------- Step 6.1: Quantize scale for traffic flow (departure ratio) ----------
  let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);
  const flowOf = (d) => stationFlow(d.departures / d.totalTraffic || 0.5); // no trips -> balanced

  // ---------- Step 3.2: Select the SVG overlay inside the map container ----------
  const svg = d3.select('#map').select('svg');

  // ---------- Step 3.3 / 4.3 / 4.4 / 5.3 (key) / 6.1: Station circles ----------
  const circles = svg
    .selectAll('circle')
    .data(stations, (d) => d.short_name) // Step 5.3: key so D3 reuses elements
    .enter()
    .append('circle')
    .attr('r', (d) => radiusScale(d.totalTraffic)) // Step 4.3: size by traffic
    .each(function (d) {
      // Step 4.4: tooltip (<title>) with exact traffic numbers
      d3.select(this)
        .append('title')
        .text(
          `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`,
        );
    })
    .style('--departure-ratio', (d) => flowOf(d)); // Step 6.1: color by traffic flow

  // ---------- Step 3.3: Keep circles aligned with the map ----------
  function updatePositions() {
    circles
      .attr('cx', (d) => getCoords(d).cx) // Set the x-position using projected coordinates
      .attr('cy', (d) => getCoords(d).cy); // Set the y-position using projected coordinates
  }

  // Initial position update when map loads
  updatePositions();

  // Reposition markers on map interactions
  map.on('move', updatePositions); // Update during map movement
  map.on('zoom', updatePositions); // Update during zooming
  map.on('resize', updatePositions); // Update on window resize
  map.on('moveend', updatePositions); // Final adjustment after movement ends

  // ---------- Step 5.2: Select slider + display elements ----------
  const timeSlider = document.getElementById('time-slider');
  const selectedTime = document.getElementById('selected-time');
  const anyTimeLabel = document.getElementById('any-time');

  // ---------- Step 5.3: Update circles for the selected time (+ Step 4.4 / 6.1 refresh) ----------
  function updateScatterPlot(timeFilter) {
    // Recompute station traffic for the filtered time window (Step 5.4 buckets)
    const filteredStations = computeStationTraffic(stations, timeFilter);

    // Bigger circles when filtering, since fewer trips are shown
    timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);

    // Update the scatterplot by adjusting the radius of circles
    circles
      .data(filteredStations, (d) => d.short_name) // keyed join
      .join('circle')
      .attr('r', (d) => radiusScale(d.totalTraffic)) // Update circle sizes
      .style('--departure-ratio', (d) => flowOf(d)); // Step 6.1: update color

    // Step 4.4: keep tooltips in sync with filtered numbers
    circles
      .select('title')
      .text(
        (d) =>
          `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`,
      );
  }

  // ---------- Step 5.2: Reactivity (slider -> time label -> map) ----------
  function updateTimeDisplay() {
    let timeFilter = Number(timeSlider.value); // Get slider value

    if (timeFilter === -1) {
      selectedTime.textContent = ''; // Clear time display
      anyTimeLabel.style.display = 'block'; // Show "(any time)"
    } else {
      selectedTime.textContent = formatTime(timeFilter); // Display formatted time
      anyTimeLabel.style.display = 'none'; // Hide "(any time)"
    }

    // Step 5.3: Call updateScatterPlot to reflect the changes on the map
    updateScatterPlot(timeFilter);
  }

  timeSlider.addEventListener('input', updateTimeDisplay);
  updateTimeDisplay();
});
