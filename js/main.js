// Dimensions and projection
const mapWidth = 650;
const mapHeight = 550;
const legendWidth = 20;
const legendHeight = 250;

// Constants
const START_DATE = '2023-07-01';
const END_DATE = '2024-06-30';
const INTERVAL_TIME = 100;
const TRANSITION_TIME = 100;

// Define seasons with start and end dates
const SEASONS = [
    { name: 'Winter', start: '2023-07-01', end: '2023-08-31'},
    { name: 'Spring', start: '2023-09-01', end: '2023-11-30'},
    { name: 'Summer', start: '2023-12-01', end: '2024-02-28'},
    { name: 'Autumn', start: '2024-03-01', end: '2024-05-31'},
    { name: 'Winter', start: '2024-06-01', end: '2024-06-30'}
];

// GeoJSON file with all regions combined
const regions_geo = "data/raw_data/regions/au-postcodes-Visvalingam-5.geojson";

// CSV file with regions and temperatures
const regions_with_temperatures = "data/aggregated_data/postcodes_with_temperatures_From20230701.csv"

// Initialise state
let currentDayOffset = 0;
let intervalId;

const parseTime = d3.timeParse('%Y-%m-%d');
const formatTime = d3.timeFormat('%d/%m/%Y');

// Colour scale
const tempScale = d3.scaleSequential(d3.interpolateCool)
    .domain([-10, 40]);

// Initialise date label
$('#dateLabel')[0].innerHTML = formatDateToFullDate(parseTime(START_DATE));

const projection = d3.geoMercator()
    .center([133.7751, -25.2744])
    .scale(700)
    .translate([mapWidth/2+30, mapHeight/2-30]);

const path = d3.geoPath().projection(projection);

// Create map SVG container
const mapSvg = d3.select("#map").append("svg")
    .attr("width", mapWidth)
    .attr("height", mapHeight);

// Zoom
const zoom = d3.zoom()
    .scaleExtent([1, 8])
    .on('zoom', zoomed);
mapSvg.call(zoom);

// Tooltip
let tip = d3.select("#tooltip");

// Create legend SVG container
const legendSvg = d3.select("#legend").append("svg")
    .attr("width", 70)
    .attr("height", mapHeight)
    .append("g")
    .attr('transform', `translate(50, 120)`);

const legend = legendSvg.append('defs')
    .append("linearGradient")
    .attr("id", "gradient")
    .attr("x1", "0%")
    .attr("y1", "0%")
    .attr("x2", "0%")
    .attr("y2", "100%")
    .attr("spreadMethod", "pad");

// Define the color stops and their offsets
const colourStops = [
    { offset: "0%", colour: 1 },
    { offset: "20%", colour: 0.8 },
    { offset: "40%", colour: 0.6 },
    { offset: "60%", colour: 0.4 },
    { offset: "80%", colour: 0.2 },
    { offset: "100%", colour: 0 }
];

// Append stops to the legend
legend.selectAll("stop")
    .data(colourStops)
    .enter()
    .append("stop")
    .attr("offset", d => d.offset)
    .attr("stop-color", d => d3.interpolateCool(d.colour))
    .attr("stop-opacity", 1);

legendSvg.append("rect")
    .attr("width", legendWidth)
    .attr("height", legendHeight)
    .style("fill", "url(#gradient)");

const y = d3.scaleLinear()
    .domain([40, -10])
    .range([0, legendHeight]);

const axisLeft = d3.axisLeft(y)
    .ticks(5)
    .tickFormat(d => `${d} °C`);

legendSvg.append("g")
    .attr("class", "axis")
    .call(axisLeft);

// Load the regions and temperature data
Promise.all([
    d3.json(regions_geo),
    d3.csv(regions_with_temperatures)
]).then(([regions, data]) => {
    console.log(regions)
    console.log(data)

    // Prepare and clean data
    data.forEach(entry => {
        entry['Date'] = parseTime(entry['Date']);
        entry['Avg_temp'] = Number(entry['Avg_temp']);
    });

    // Find the minimum and maximum dates
    const minDate = d3.min(data, d => d['Date']);
    const maxDate = d3.max(data, d => d['Date']);
    // Calculate the difference in days (add 1 to include start date)
    const numDays = Math.floor((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1;
    console.log(`The period is from ${formatDateToFullDate(minDate)} to ${formatDateToFullDate(maxDate)} - spanning a total of ${numDays} days.`);
    
    // Play button event listener
    $('#play-button')
        .on('click', function() {
            const button = $(this)
            if (button.text() === 'Play') {
                button.text('Pause')
                intervalId = setInterval(() => {
                    currentDayOffset = currentDayOffset + 1; // Increment the current day offset
                    // Reset to the start if the end of the period is reached
                    if (currentDayOffset >= numDays) {
                        currentDayOffset = 0; // Start from the beginning
                    }
                    updateMap(currentDayOffset);
                }, INTERVAL_TIME)
            }
            else { // When pausing
                button.text('Play')
                clearInterval(intervalId)
            }
        })
    
    // Reset button event listener
    $('#reset-button')
        .on('click', () => {
            currentDayOffset = 0
            updateMap(currentDayOffset);
        })
    
    // Date slider initialisation
    $("#date-slider")
        .slider({
            min: 0,
            max: numDays,
            step: 1,
            slide: (event, ui) => {
                currentDayOffset = ui.value;
                updateMap(currentDayOffset);
                const date = dateFromDayOffset(currentDayOffset);
                updateSliderColor(date); // Update slider color based on the current date
            },
            create: () => {
                const startDate = parseTime(START_DATE);
                updateSliderColor(startDate); // Set initial slider color
            }
        })

    // Zoom in button event listener
    $("#zoom-in")
        .on("click", () => {
            zoom.scaleBy(mapSvg.transition().duration(TRANSITION_TIME), 1.2);
    });

    // Zoom out button event listener
    $("#zoom-out")
        .on("click", () => {
            zoom.scaleBy(mapSvg.transition().duration(TRANSITION_TIME), 0.8);
    });

    // Group data by date string
    const temperaturesByDate = d3.group(data, d => formatTime(d['Date']));

    // Initial map update
    updateMap(currentDayOffset);

    // Hide the loading overlay
    $('#loading-overlay').css('display', 'none');

    // Update map function
    function updateMap(dayOffset) {
        const date = dateFromDayOffset(dayOffset);
        const dateString = formatTime(date);
        const dayData = temperaturesByDate.get(dateString);
        const avgTemp = d3.mean(dayData, d => d['Avg_temp']);

        // Create a map of postcode temperatures for the selected date
        const regionTemperatures = new Map(
            dayData.map(d => [d['Postcode'], d['Avg_temp']])
        );

        // Initialise transition
        const t = d3.transition()
            .duration(TRANSITION_TIME)
            .ease(d3.easeLinear);

        // JOIN new data to the old elements
        const paths = mapSvg.selectAll(".regions")
            .data(regions.features, d => d.properties['POA_CODE']); // Use a unique key if possible

        // EXIT old elements not present in new data
        paths.exit().remove(); // won't happen - regions are static

        // ENTER new elements present in new data
        paths.enter().append("path")
            .attr("class", "regions")
            .attr("d", path)
            .on('mouseover', event => {
                tip.style('visibility', 'visible')
                const postcode = event.target.__data__.properties['POA_CODE'];
                const temp = regionTemperatures.get(postcode) || avgTemp;
                tip.text(`Postcode: ${postcode}\nTemperature: ${temp.toFixed(1)}°C`);
            })
            .on('mousemove', event => {
                tip.style('top', (event.pageY)+'px')
                    .style('left', (event.pageX)+'px')
            })
            .on('mouseout', () => {
                tip.style('visibility', 'hidden');
            })
            .merge(paths) // UPDATE old elements present in new data
            .transition(t)
                .attr("fill", d => {
                    const temp = regionTemperatures.get(d.properties['POA_CODE']) || avgTemp;
                    return tempScale(temp);
                })
                .attr("d", path); // Ensure `d` attribute is updated with `path` function
        
        // Update UI
        updateSliderColor(date); // Update slider color based on the current date
        $('#dateLabel')[0].innerHTML = formatDateToFullDate(date);
        $('#date-slider').slider('value', dayOffset);
    }
})

// Function to get date from day offset
function dateFromDayOffset(dayOffset) {
    const date = parseTime(START_DATE);
    date.setDate(date.getDate() + dayOffset);
    return date;
}

// Function to get full date in desired format
function formatDateToFullDate(date) {
    // Array of month names
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // Extract day, month, and year from the date
    const day = date.getDate(); // Day of the month
    const month = monthNames[date.getMonth()]; // Month name
    const year = date.getFullYear(); // Year

    // Construct and return the formatted date string
    return `${day} ${month}, ${year}`;
}

// Function to get the current season based on the date
function getSeason(date) {
    for (const season of SEASONS) {
        const start = parseTime(season.start);
        const end = parseTime(season.end);
        if (date >= start && date <= end) {
            return season;
        }
    }
    return null; // Return null if no season is found
}

// Update slider colors based on the current date
function updateSliderColor(date) {
    const season = getSeason(date);
    if (season) {
        $('#date-slider').removeClass('ui-slider-range-winter ui-slider-range-spring ui-slider-range-summer ui-slider-range-autumn')
                         .addClass(`ui-slider-range-${season.name.toLowerCase()}`);
        
        // Set the season label with appropriate colour
        $('#seasonLabel')
            .text(`(${season.name})`)
            .attr('class', `seasonLabel ${season.name.toLowerCase()}`);
    }
}

// Zoom function
function zoomed(event) {
    mapSvg.selectAll("path")
        .attr("transform", event.transform);
}