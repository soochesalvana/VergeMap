let map;
let mapLayers = {};
let countryLayers = {};

// ── Success Popup ─────────────────────────────────────────────────────────────
function showSuccessPopup(message) {
    const existing = document.getElementById('successPopup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'successPopup';
    popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        z-index: 9999;
        background: #0a0a0a;
        border: 1px solid rgba(16,185,129,0.35);
        border-radius: 14px;
        padding: 28px 32px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        text-align: center;
        box-shadow: 0 0 0 1px rgba(16,185,129,0.08), 0 20px 60px rgba(0,0,0,0.8);
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.92);
        transition: opacity 0.35s ease, transform 0.35s ease;
        min-width: 300px;
        max-width: 420px;
    `;

    popup.innerHTML = `
        <div class="success-ring" style="
            width: 36px; height: 36px;
            border-radius: 50%;
            border: 2px solid rgba(16,185,129,0.25);
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0;
            position: relative;
        ">
            <svg class="success-check" viewBox="0 0 24 24" fill="none" width="18" height="18"
                style="opacity:0; transform: scale(0.5); transition: opacity 0.3s ease 0.4s, transform 0.3s ease 0.4s;">
                <path d="M5 13l4 4L19 7" stroke="#10b981" stroke-width="2.5"
                    stroke-linecap="round" stroke-linejoin="round"
                    stroke-dasharray="24" stroke-dashoffset="24"
                    style="animation: drawCheck 0.4s ease 0.4s forwards;">
                </path>
            </svg>
            <svg class="success-ring-svg" viewBox="0 0 36 36" width="36" height="36"
                style="position:absolute; top:-2px; left:-2px;">
                <circle cx="18" cy="18" r="16" fill="none" stroke="#10b981" stroke-width="2"
                    stroke-dasharray="100.5" stroke-dashoffset="100.5"
                    style="animation: drawRing 0.5s ease 0.05s forwards; transform-origin: center; transform: rotate(-90deg);">
                </circle>
            </svg>
        </div>
        <div>
            <p style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #10b981; margin: 0 0 2px;">Success</p>
            <p style="font-size: 13px; color: #ccc; margin: 0; line-height: 1.4;">${message}</p>
        </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
        @keyframes drawRing {
            to { stroke-dashoffset: 0; }
        }
        @keyframes drawCheck {
            to { stroke-dashoffset: 0; }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(popup);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            popup.style.opacity = '1';
            popup.style.transform = 'translate(-50%, -50%) scale(1)';
            const check = popup.querySelector('.success-check');
            if (check) {
                check.style.opacity = '1';
                check.style.transform = 'scale(1)';
            }
        });
    });

    setTimeout(() => {
        popup.style.opacity = '0';
        popup.style.transform = 'translate(-50%, -50%) scale(0.95)';
        setTimeout(() => popup.remove(), 400);
    }, 3800);
}

// ── Page switching ────────────────────────────────────────────────────────────
function switchPage(pageId) {
    document.querySelectorAll('.page-content').forEach(page => {
        page.classList.add('hidden');
    });
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('nav-active');
    });

    document.getElementById(pageId).classList.remove('hidden');
    document.getElementById('nav-' + pageId).classList.add('nav-active');

    if (pageId === 'page2' && map) {
        setTimeout(() => { map.invalidateSize(); }, 100);
    }
}

function initMap() {
    const worldBounds = L.latLngBounds(
        L.latLng(-75, -180),
        L.latLng(85, 180)
    );

    map = L.map('vergeMap', {
        worldCopyJump: false,
        minZoom: 2,
        maxZoom: 18,
        maxBounds: worldBounds,
        maxBoundsViscosity: 1.0
    }).setView([20, 0], 2);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
        noWrap: true,
        bounds: worldBounds
    }).addTo(map);
}

initMap();
loadCountryAQIMap();
switchPage('page1');

let locations = {};

document.getElementById("forecastBtn").addEventListener("click", forecastAQI);
loadLocations();

// ── Chart instances ───────────────────────────────────────────────────────────
let riskChartInstance = null;
let regionalChartInstance = null;
let historicalChart = null;
let highRiskChartInstance = null;

// ── Load locations + re-render everything ─────────────────────────────────────
async function loadLocations() {
    try {
        const response = await fetch("/locations");
        if (!response.ok) throw new Error(`Server Error: ${response.status}`);
        locations = await response.json();
    } catch (error) {
        locations = {
            "United States": ["New York", "Los Angeles", "Seattle", "Chicago"],
            "United Kingdom": ["London", "Manchester", "Edinburgh"],
            "Japan": ["Tokyo", "Osaka", "Kyoto"],
            "Philippines": ["Manila", "Cebu City", "Davao"]
        };
    }

    const countryDropdown = document.getElementById("country");
    const trendCityDropdown = document.getElementById("trendCity");

    countryDropdown.innerHTML = `<option value="">Select Country</option>`;
    trendCityDropdown.innerHTML = ``;

    Object.keys(locations).forEach(country => {
        const option = document.createElement("option");
        option.value = country;
        option.textContent = country;
        countryDropdown.appendChild(option);

        locations[country].forEach(city => {
            const cityOption = document.createElement("option");
            cityOption.value = city;
            cityOption.textContent = `${city} (${country})`;
            trendCityDropdown.appendChild(cityOption);
        });
    });

    countryDropdown.addEventListener("change", updateCities);

    populateDashboard(locations);
    loadDashboardStats();
    loadHighRiskAreas();
    refreshCharts();
}

// ── Refresh all charts (destroys old instances first) ─────────────────────────
async function refreshCharts() {
    // Risk doughnut
    try {
        const res = await fetch("/chart-data");
        const data = await res.json();

        const riskCtx = document.getElementById("riskChart");
        if (riskChartInstance) { riskChartInstance.destroy(); riskChartInstance = null; }

        riskChartInstance = new Chart(riskCtx, {
            type: "doughnut",
            data: {
                labels: ["Stable", "Warning", "Critical"],
                datasets: [{
                    data: [data.stable, data.warning, data.critical],
                    backgroundColor: ["#4CAF50", "#FFC107", "#F44336"]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: "bottom" } }
            }
        });
    } catch (e) { console.error("Risk chart error:", e); }

    // Regional bar
    try {
        const res = await fetch("/region-aqi");
        const regionData = await res.json();
        const values = Object.values(regionData);
        const colors = values.map(aqi => aqi < 50 ? "#4CAF50" : aqi <= 150 ? "#FFC107" : "#F44336");

        const regionalCtx = document.getElementById("regionalChart");
        if (regionalChartInstance) { regionalChartInstance.destroy(); regionalChartInstance = null; }

        regionalChartInstance = new Chart(regionalCtx, {
            type: "bar",
            data: {
                labels: Object.keys(regionData),
                datasets: [{ data: values, backgroundColor: colors }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });
    } catch (e) { console.error("Region chart error:", e); }
}

function populateDashboard(locData) {
    Chart.defaults.color = '#888888';
    Chart.defaults.borderColor = '#1f1f1f';
    Chart.defaults.font.family = '"JetBrains Mono", monospace';
}

async function loadDashboardStats() {
    try {
        const response = await fetch("/dashboard-stats");
        if (!response.ok) throw new Error(`Server Error: ${response.status}`);
        const data = await response.json();
        document.getElementById("dash-total-cities").textContent = data.totalCities;
        document.getElementById("dash-avg-aqi").textContent = data.avgAqi;
    } catch (error) {
        console.error("Dashboard stats failed:", error);
        document.getElementById("dash-total-cities").textContent = "N/A";
        document.getElementById("dash-avg-aqi").textContent = "N/A";
    }
}

function updateCities() {
    const selectedCountry = document.getElementById("country").value;
    const cityDropdown = document.getElementById("city");
    cityDropdown.innerHTML = `<option value="">Select City</option>`;
    if (!selectedCountry) return;
    locations[selectedCountry].forEach(city => {
        const option = document.createElement("option");
        option.value = city;
        option.textContent = city;
        cityDropdown.appendChild(option);
    });
}

async function forecastAQI() {
    const country = document.getElementById("country").value;
    const city = document.getElementById("city").value;

    if (!country || !city) {
        document.getElementById("results").innerHTML = `
            <div class="p-4 text-amber-500 rounded-lg bg-amber-500/10 border border-amber-500/20 font-mono text-sm">
                Please select both a country and a city to generate a forecast.
            </div>`;
        return;
    }

    document.getElementById("results").innerHTML = `
        <div class="text-emerald-500 font-mono text-sm animate-pulse flex items-center gap-2">
            <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
                </path>
            </svg>
            Processing environmental data & updating map geometry...
        </div>
    `;

    try {
        const response = await fetch("http://127.0.0.1:5000/forecast", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ Country: country, City: city })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Forecast API Error:", errorText);
            throw new Error(`Server Error: ${response.status}`);
        }

        const data = await response.json();
        renderForecastData(data);
        renderLocationOnMap(data.city || data.City, data.country || data.Country, data.forecast || data.Forecast);

    } catch (error) {
        document.getElementById("results").innerHTML = `
            <div class="p-4 text-red-500 rounded-lg bg-red-500/10 border border-red-500/20 font-mono text-sm">
                ${error.message}
            </div>
        `;
        console.error("Forecast Error:", error);
    }
}

function renderForecastData(data) {
    let html = `
        <div class="space-y-6">
            <div class="border-b border-brand-border pb-4">
                <div class="flex justify-between items-end mb-3">
                    <div>
                        <h4 class="text-xl font-semibold mb-1">Prediction Results</h4>
                        <div class="text-sm font-mono text-brand-textMuted">
                            Location: <span class="text-emerald-500">${data.City}, ${data.Country}</span>
                        </div>
                    </div>
                    <button onclick="switchPage('page2')" class="text-xs font-mono text-emerald-500 hover:text-white transition-colors border border-emerald-500 hover:bg-emerald-500/20 px-3 py-1.5 rounded shrink-0">
                        View on Map &rarr;
                    </button>
                </div>
                <p class="text-xs text-brand-textMuted leading-relaxed">
                    Note: The map displays the city's official administrative boundary. For coastal cities, this includes municipal waters, so the highlighted area may extend beyond the coastline into the sea.
                </p>
            </div>
    `;

    data.Forecast.forEach(item => {
        let recommendation = "Standard precautions";
        let riskText = item.risk.toLowerCase();

        if (riskText.includes('stable')) recommendation = "Maintain current environmental protection and sustainability efforts.";
        else if (riskText.includes('warning')) recommendation = "Implement pollution control measures and closely monitor environmental conditions.";
        else if (riskText.includes('critical')) recommendation = "Enforce immediate environmental interventions to reduce pollution and prevent further degradation.";

        html += `
            <div class="bg-brand-black border border-[#1f1f1f] rounded-xl p-6 relative overflow-hidden group">
                <div class="absolute left-0 top-0 bottom-0 w-1 ${riskText.includes('critical') ? 'bg-rose-500' : (riskText.includes('warning') ? 'bg-amber-500' : 'bg-emerald-500')} opacity-50 group-hover:opacity-100 transition-opacity"></div>

                <div class="mb-4 text-white font-mono text-xs uppercase tracking-widest border-b border-[#1f1f1f] pb-2 inline-block">
                    Forecast Year: <span class="text-emerald-500">${item.year}</span>
                </div>

                <div class="font-mono text-sm space-y-4 text-brand-textMuted">
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center border-b border-[#111] pb-2">
                        <span>Predicted AQI</span>
                        <span class="text-white text-base font-bold mt-1 sm:mt-0">${item.aqi}</span>
                    </div>
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center border-b border-[#111] pb-2">
                        <span>Risk Level</span>
                        <span class="${riskText.includes('critical') ? 'text-rose-500' : (riskText.includes('warning') ? 'text-amber-500' : 'text-emerald-500')} font-semibold text-base mt-1 sm:mt-0">${item.risk}</span>
                    </div>
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start pt-1">
                        <span>Recommendation</span>
                        <span class="text-brand-textMuted text-sm mt-1 sm:mt-0 sm:text-right max-w-xs leading-relaxed">${recommendation}</span>
                    </div>
                </div>
            </div>
        `;
    });

    html += `</div>`;
    document.getElementById("results").innerHTML = html;
}

// ── Map ───────────────────────────────────────────────────────────────────────
async function fetchCityPolygon(city, country) {
    const query = encodeURIComponent(`${city}, ${country}`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&polygon_geojson=1&format=json`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data && data.length > 0) {
            const polygonResult = data.find(item => item.geojson && (item.geojson.type === 'Polygon' || item.geojson.type === 'MultiPolygon'));
            if (polygonResult) return polygonResult.geojson;
        }
    } catch (err) {
        console.error("Failed fetching boundary:", err);
    }
    return null;
}

async function renderLocationOnMap(city, country, forecastData) {
    const geojson = await fetchCityPolygon(city, country);

    const targetForecast = forecastData.find(f => f.year === 2026) || forecastData[forecastData.length - 1];
    const aqiValue = targetForecast.aqi;
    const riskLevel = targetForecast.risk.toLowerCase();

    let color = '#10b981';
    if (riskLevel.includes('warning')) color = '#f59e0b';
    if (riskLevel.includes('critical')) color = '#f43f5e';

    const layerKey = `${city}-${country}`;

    Object.keys(mapLayers).forEach(key => {
        map.removeLayer(mapLayers[key]);
        delete mapLayers[key];
    });

    if (countryLayers[country]) {
        map.removeLayer(countryLayers[country]);
    }

    if (geojson) {
        const boundaryLayer = L.geoJSON(geojson, {
            style: {
                color: color, weight: 2, opacity: 0.8,
                fillColor: color, fillOpacity: 0.25
            }
        });

        const popupContent = `
            <div class="font-sans">
                <div class="text-xs text-[#888] uppercase tracking-wide mb-1">
                    Predicted AQI (${targetForecast.year})
                </div>
                <h4 class="text-xl font-bold text-black m-0">${city}</h4>
                <div class="w-full h-px bg-[#333] my-2"></div>
                <div class="flex justify-between items-center gap-4 text-sm mt-2">
                    <span class="text-[#888]">Value:</span>
                    <strong style="color: ${color}; font-size: 1.2em;">${aqiValue}</strong>
                </div>
                <div class="flex justify-between items-center gap-4 text-sm mt-1">
                    <span class="text-[#888]">Risk:</span>
                    <span style="color: ${color};">${targetForecast.risk}</span>
                </div>
            </div>
        `;

        boundaryLayer.bindPopup(popupContent);
        boundaryLayer.bindTooltip(popupContent, { sticky: true, direction: "top", opacity: 0.95 });
        boundaryLayer.addTo(map);
        mapLayers[layerKey] = boundaryLayer;

        const center = boundaryLayer.getBounds().getCenter();
        map.flyTo(center, 10);
    } else {
        console.warn("Could not find exact polygon for", city, country);
    }
}

// ── Country AQI map ───────────────────────────────────────────────────────────
async function loadCountryAQIMap() {
    const aqiResponse = await fetch("/country-aqi");
    const aqiData = await aqiResponse.json();

    const geoResponse = await fetch(
        "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json"
    );
    const geoData = await geoResponse.json();

    const countryMap = {
        "United States of America": "USA",
        "United Kingdom": "UK",
        "Russian Federation": "Russia"
    };

    L.geoJSON(geoData, {
        style: feature => {
            let country = feature.properties.name;
            if (countryMap[country]) country = countryMap[country];

            const avgAqi = aqiData[country];
            let color = "#666";

            if (avgAqi !== undefined) {
                if (avgAqi > 150) color = "#f43f5e";
                else if (avgAqi > 50) color = "#f59e0b";
                else color = "#10b981";
            }

            return { fillColor: color, fillOpacity: 0.7, color: "#333", weight: 1 };
        },

        onEachFeature: (feature, layer) => {
            let country = feature.properties.name;
            if (countryMap[country]) country = countryMap[country];

            countryLayers[country] = layer;

            const avgAqi = aqiData[country];
            if (avgAqi !== undefined) {
                let status = "Stable";
                if (avgAqi > 150) status = "Critical";
                else if (avgAqi > 50) status = "Warning";

                layer.bindTooltip(`
                    <b>${country}</b><br>
                    <b>Average AQI:</b> ${avgAqi}<br>
                    <b>Status:</b> ${status}
                `, { sticky: true });
            }
        }
    }).addTo(map);
}

// ── Analytics ─────────────────────────────────────────────────────────────────
document.getElementById("city").addEventListener("change", () => {
    const country = document.getElementById("country").value;
    const city = document.getElementById("city").value;
    if (country && city) loadHistoricalTrend(country, city);
});

document.getElementById("trendCity").addEventListener("change", () => {
    const selectedCity = document.getElementById("trendCity").value;
    let selectedCountry = null;
    Object.keys(locations).forEach(country => {
        if (locations[country].includes(selectedCity)) selectedCountry = country;
    });
    if (selectedCountry && selectedCity) loadHistoricalTrend(selectedCountry, selectedCity);
});

async function loadHistoricalTrend(country, city) {
    try {
        const response = await fetch("http://127.0.0.1:5000/historical", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ Country: country, City: city })
        });

        if (!response.ok) throw new Error(`Server Error: ${response.status}`);

        const data = await response.json();
        const ctx = document.getElementById("historicalTrendChart").getContext("2d");

        if (historicalChart) { historicalChart.destroy(); }

        historicalChart = new Chart(ctx, {
            type: "line",
            data: {
                labels: data.years,
                datasets: [{
                    label: "AQI",
                    data: data.aqi,
                    borderColor: "#10b981",
                    backgroundColor: "rgba(16,185,129,0.1)",
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    } catch (error) {
        console.error("Historical fetch failed:", error);
    }
}

async function loadHighRiskAreas() {
    try {
        const response = await fetch("/high-risk-areas");
        if (!response.ok) throw new Error(`Server Error: ${response.status}`);
        const data = await response.json();
        drawHighRiskChart(data);
    } catch (error) {
        console.error("High risk areas fetch failed:", error);
    }
}

function drawHighRiskChart(data) {
    const ctx = document.getElementById("highRiskChart").getContext("2d");
    if (highRiskChartInstance) { highRiskChartInstance.destroy(); }

    highRiskChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels: data.map(item => item.City),
            datasets: [{
                label: "AQI",
                data: data.map(item => item.AQI),
                backgroundColor: "#f43f5e",
                borderColor: "#f43f5e",
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

// ── Dataset download ──────────────────────────────────────────────────────────
document.getElementById("downloadDatasetBtn").addEventListener("click", () => {
    window.location.href = "/download-dataset";
});

document.getElementById("datasetUpload").addEventListener("change", function () {
    const file = this.files[0];
    document.getElementById("selectedFileName").textContent = file ? file.name : "No file selected";
});

// ── Dataset verification ──────────────────────────────────────────────────────
const REQUIRED_COLUMNS = [
    "Country", "City", "Year", "AQI", "PM2.5", "PM10",
    "Deforestation_Rate_%", "Afforestation_Rate_%",
    "Vehicles_Increase_%", "Industries_Increase_%",
    "Env_Budget_Million_USD", "Population_Density_Per_SqKm",
    "CO2_Emissions_MT", "Green_Space_Ratio_%", "Avg_Life_Expectancy_Index"
];

const NUMERIC_COLUMNS = [
    "Year", "AQI", "PM2.5", "PM10",
    "Deforestation_Rate_%", "Afforestation_Rate_%",
    "Vehicles_Increase_%", "Industries_Increase_%",
    "Env_Budget_Million_USD", "Population_Density_Per_SqKm",
    "CO2_Emissions_MT", "Green_Space_Ratio_%", "Avg_Life_Expectancy_Index"
];

function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return { headers: [], rows: [] };
    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    const rows = lines.slice(1).map(line => {
        const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
        return obj;
    });
    return { headers, rows };
}

function setCheck(id, state, detail) {
    const el = document.getElementById(id);
    if (!el) return;
    const icon = el.querySelector(".req-icon");

    el.classList.remove(
        "border-brand-border", "border-emerald-500/40", "border-rose-500/40",
        "bg-[#0d0d0d]", "bg-emerald-500/5", "bg-rose-500/5"
    );

    if (state === "pass") {
        icon.textContent = "✓";
        icon.style.color = "#10b981";
        el.classList.add("border-emerald-500/40", "bg-emerald-500/5");
    } else if (state === "fail") {
        icon.textContent = "✗";
        icon.style.color = "#f43f5e";
        el.classList.add("border-rose-500/40", "bg-rose-500/5");
        if (detail) {
            let note = el.querySelector(".chk-note");
            if (!note) {
                note = document.createElement("span");
                note.className = "chk-note block text-xs text-rose-400 mt-1";
                el.querySelector("span:last-child").appendChild(note);
            }
            note.textContent = detail;
        }
    } else {
        icon.textContent = "⬤";
        icon.style.color = "";
        el.classList.add("border-brand-border", "bg-[#0d0d0d]");
    }
}

function resetChecks() {
    document.querySelectorAll(".req-item").forEach(el => {
        const icon = el.querySelector(".req-icon");
        icon.textContent = "⬤";
        icon.style.color = "";
        el.classList.remove(
            "border-emerald-500/40", "bg-emerald-500/5",
            "border-rose-500/40", "bg-rose-500/5"
        );
        el.classList.add("border-brand-border", "bg-[#0d0d0d]");
        const note = el.querySelector(".chk-note");
        if (note) note.remove();
    });

    const badge = document.getElementById("verifyBadge");
    badge.classList.add("hidden");

    const msg = document.getElementById("verifyMessage");
    msg.classList.add("hidden");

    document.getElementById("confirmUploadBtn").disabled = true;
}

// animated verification
async function runVerificationAnimated(file, text) {
    resetChecks();

    const DELAY = 220;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let allPass = true;

    // 1. CSV format
    await sleep(DELAY);
    const isCsv = file.name.toLowerCase().endsWith(".csv")
        || file.type === "text/csv"
        || file.type === "application/vnd.ms-excel";
    setCheck("chk-csv", isCsv ? "pass" : "fail", isCsv ? null : "File must have a .csv extension");
    if (!isCsv) allPass = false;

    // 1b. Filename check
    await sleep(DELAY);
    const expectedName = "user_uploaded.csv";
    const nameOk = file.name === expectedName;
    setCheck("chk-filename", nameOk ? "pass" : "fail",
        nameOk ? null : `File must be named "${expectedName}" — got "${file.name}"`);
    if (!nameOk) allPass = false;

    // 2. Not empty
    await sleep(DELAY);
    const { headers, rows } = parseCSV(text);
    const hasRows = rows.length > 0;
    setCheck("chk-nonempty", hasRows ? "pass" : "fail", hasRows ? null : `No data rows found`);
    if (!hasRows) allPass = false;

    // 3. Required columns — reveal each column check with a short stagger
    for (const col of REQUIRED_COLUMNS) {
        await sleep(80);
        const present = headers.includes(col);
        setCheck(`chk-col-${col}`, present ? "pass" : "fail", present ? null : "Column missing");
        if (!present) allPass = false;
    }

    const hasAllCols = REQUIRED_COLUMNS.every(c => headers.includes(c));

    // 4. Naming convention
    await sleep(DELAY);
    const KNOWN_COUNTRIES = new Set([
        "Argentina","Australia","Bangladesh","Brazil","Canada","Chile","China","Colombia",
        "Egypt","Ethiopia","France","Germany","Ghana","India","Indonesia","Iran","Iraq",
        "Italy","Japan","Kenya","Mexico","Mongolia","Morocco","Myanmar","Netherlands",
        "Nigeria","Norway","Pakistan","Peru","Philippines","Poland","Romania","Russia",
        "Saudi Arabia","South Africa","Spain","Sweden","Tanzania","Thailand","Turkey",
        "UAE","UK","USA","Ukraine","Vietnam"
    ]);

    const KNOWN_CITIES = new Set([
        "Abu Dhabi","Abuja","Accra","Adana","Addis Ababa","Adelaide","Ajman","Al Ain",
        "Alexandria","Amsterdam","Ankara","Antofagasta","Arequipa","Arusha","Aswan",
        "Baghdad","Bago","Bandung","Bangalore","Bangkok","Barcelona","Barranquilla",
        "Basra","Beijing","Bergen","Berlin","Bilbao","Birmingham","Bogota","Brasilia",
        "Brisbane","Bucharest","Buenos Aires","Bursa","Cairo","Calgary","Cali","Can Tho",
        "Cape Coast","Cape Town","Cartagena","Casablanca","Cebu City","Chengdu","Chennai",
        "Chiang Mai","Chicago","Chiclayo","Chittagong","Choibalsan","Cluj-Napoca","Cologne",
        "Concepcion","Constanta","Cordoba","Cusco","Da Nang","Dammam","Dar es Salaam",
        "Darkhan","Davao","Delhi","Dhaka","Dire Dawa","Dnipro","Dodoma","Dubai","Durban",
        "Eindhoven","Eldoret","Erbil","Erdenet","Faisalabad","Fez","Fortaleza","Frankfurt",
        "Gdansk","Giza","Glasgow","Gondar","Gothenburg","Guadalajara","Guangzhou",
        "Hai Phong","Hamburg","Hanoi","Harar","Ho Chi Minh City","Houston","Iasi","Ibadan",
        "Isfahan","Islamabad","Istanbul","Izmir","Jakarta","Jeddah","Johannesburg","Kano",
        "Karachi","Karaj","Kazan","Kharkiv","Khon Kaen","Khulna","Kisumu","Kolkata",
        "Krakow","Kristiansand","Kumasi","Kyiv","Kyoto","La Plata","Lagos","Lahore","Lima",
        "Liverpool","London","Los Angeles","Luxor","Lviv","Lyon","Madrid","Makassar",
        "Malmo","Manchester","Mandalay","Manila","Marrakech","Marseille","Mashhad",
        "Mawlamyine","Mbeya","Mecca","Medan","Medellin","Medina","Mekelle","Melbourne",
        "Mendoza","Mexico City","Milan","Mombasa","Monterrey","Montreal","Moscow","Mosul",
        "Mumbai","Munich","Murun","Mwanza","Nagoya","Nairobi","Najaf","Nakuru","Naples",
        "Naypyidaw","New York","Nice","Novosibirsk","Odessa","Osaka","Oslo","Ottawa",
        "Palermo","Paris","Pattaya","Perth","Phoenix","Phuket","Port Elizabeth",
        "Port Harcourt","Poznan","Pretoria","Puebla","Quezon City","Rabat","Rajshahi",
        "Rawalpindi","Rio de Janeiro","Riyadh","Rome","Rosario","Rotterdam",
        "Saint Petersburg","Salvador","Santiago","Sao Paulo","Sekondi","Seville",
        "Shanghai","Sharjah","Shenzhen","Stavanger","Stockholm","Surabaya","Sydney",
        "Sylhet","Tabriz","Tamale","Tangier","Tehran","Temuco","The Hague","Tijuana",
        "Timisoara","Tokyo","Toronto","Toulouse","Trondheim","Trujillo","Turin",
        "Ulaanbaatar","Uppsala","Utrecht","Valencia","Valparaiso","Vancouver","Vasteras",
        "Warsaw","Wroclaw","Yangon","Yekaterinburg","Yokohama","Zamboanga"
    ]);

    if (hasAllCols && hasRows) {
        const badCountries = [...new Set(rows.map(r => r.Country).filter(c => c && !KNOWN_COUNTRIES.has(c)))];
        const badCities = [...new Set(rows.map(r => r.City).filter(c => c && !KNOWN_CITIES.has(c)))];
        const namingOk = badCountries.length === 0 && badCities.length === 0;
        let detail = null;
        if (!namingOk) {
            const parts = [];
            if (badCountries.length)
                parts.push(`Unrecognized countr${badCountries.length > 1 ? "ies" : "y"}: ${badCountries.slice(0, 3).join(", ")}${badCountries.length > 3 ? ` (+${badCountries.length - 3} more)` : ""}`);
            if (badCities.length)
                parts.push(`Unrecognized cit${badCities.length > 1 ? "ies" : "y"}: ${badCities.slice(0, 3).join(", ")}${badCities.length > 3 ? ` (+${badCities.length - 3} more)` : ""}`);
            detail = parts.join(" · ");
        }
        setCheck("chk-naming", namingOk ? "pass" : "fail", detail);
        if (!namingOk) allPass = false;
    } else {
        setCheck("chk-naming", "pending");
    }

    // 5. Year >= 2024
    await sleep(DELAY);
    if (hasAllCols && hasRows) {
        const oldRows = rows.filter(r => { const y = Number(r["Year"]); return !isNaN(y) && y < 2024; });
        const yearOk = oldRows.length === 0;
        setCheck("chk-year", yearOk ? "pass" : "fail",
            yearOk ? null : `${oldRows.length} record(s) have Year < 2024 — only 2024 and later are accepted`);
        if (!yearOk) allPass = false;
    } else {
        setCheck("chk-year", "pending");
    }

    // 6. No empty values in required columns
    await sleep(DELAY);
    if (hasAllCols && hasRows) {
        let emptyCells = 0;
        const emptyColNames = new Set();
        rows.forEach(r => {
            REQUIRED_COLUMNS.forEach(col => {
                if (r[col] === undefined || r[col].toString().trim() === "") {
                    emptyCells++;
                    emptyColNames.add(col);
                }
            });
        });
        const emptyOk = emptyCells === 0;
        let detail = null;
        if (!emptyOk) {
            const cols = [...emptyColNames].slice(0, 3).join(", ");
            const more = emptyColNames.size > 3 ? ` (+${emptyColNames.size - 3} more)` : "";
            detail = `${emptyCells} empty cell(s) found in: ${cols}${more}`;
        }
        setCheck("chk-empty", emptyOk ? "pass" : "fail", detail);
        if (!emptyOk) allPass = false;
    } else {
        setCheck("chk-empty", "pending");
    }

    // 7. Numeric values (must be valid numbers and non-negative)
    await sleep(DELAY);
    if (hasAllCols && hasRows) {
        let nonNumeric = 0;
        let negative = 0;
        rows.forEach(r => {
            NUMERIC_COLUMNS.forEach(col => {
                const raw = r[col];
                if (raw === undefined || raw === "") return;
                const num = Number(raw);
                if (isNaN(num)) nonNumeric++;
                else if (num < 0) negative++;
            });
        });
        const numOk = nonNumeric === 0 && negative === 0;
        let detail = null;
        if (!numOk) {
            const parts = [];
            if (nonNumeric) parts.push(`${nonNumeric} non-numeric value(s)`);
            if (negative) parts.push(`${negative} negative value(s)`);
            detail = parts.join(" · ") + " found in numeric columns";
        }
        setCheck("chk-numeric", numOk ? "pass" : "fail", detail);
        if (!numOk) allPass = false;
    } else {
        setCheck("chk-numeric", "pending");
    }

    // 7. AQI range
    await sleep(DELAY);
    if (hasAllCols && hasRows) {
        const outOfRange = rows.filter(r => { const v = Number(r["AQI"]); return !isNaN(v) && (v < 0 || v > 500); });
        const rangeOk = outOfRange.length === 0;
        setCheck("chk-aqi-range", rangeOk ? "pass" : "fail",
            rangeOk ? null : `${outOfRange.length} AQI value(s) outside 0–500`);
        if (!rangeOk) allPass = false;
    } else {
        setCheck("chk-aqi-range", "pending");
    }

    // Overall badge & message
    await sleep(180);
    const badge = document.getElementById("verifyBadge");
    const msg   = document.getElementById("verifyMessage");
    badge.classList.remove("hidden");

    if (allPass) {
        badge.textContent = "All checks passed";
        badge.className = "text-xs font-mono px-3 py-1 rounded-full border border-emerald-500/40 text-emerald-400 bg-emerald-500/10";
        msg.textContent  = "✓ Your dataset passed all required checks. You can now proceed with the upload.";
        msg.className    = "mb-4 text-sm font-mono p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-emerald-400";
        msg.classList.remove("hidden");
        document.getElementById("confirmUploadBtn").disabled = false;
    } else {
        badge.textContent = "Checks failed";
        badge.className = "text-xs font-mono px-3 py-1 rounded-full border border-rose-500/40 text-rose-400 bg-rose-500/10";
        msg.textContent  = "✗ Some required checks failed. Please fix the issues in your file and re-upload.";
        msg.className    = "mb-4 text-sm font-mono p-3 rounded-lg border border-rose-500/30 bg-rose-500/5 text-rose-400";
        msg.classList.remove("hidden");
        document.getElementById("confirmUploadBtn").disabled = true;
    }
}

// ── Upload button: read file → verify (animated) → open modal ─────────────────
document.getElementById("uploadDatasetBtn").addEventListener("click", () => {
    const file = document.getElementById("datasetUpload").files[0];

    if (!file) {
        document.getElementById("uploadStatus").textContent = "Please select a CSV file.";
        return;
    }

    // ── Filename guard ────────────────────────────────────────────────────────
    if (file.name !== "user_uploaded.csv") {
        showFilenameWarning(file.name);

        // Clear the file input and reset the label
        document.getElementById("datasetUpload").value = "";
        document.getElementById("selectedFileName").textContent = "No file selected";

        return;
    }

    selectedUploadFile = file;
    resetChecks();
    document.getElementById("datasetRequirementsModal").classList.remove("hidden");
    document.getElementById("datasetRequirementsModal").classList.add("flex");

    const reader = new FileReader();
    reader.onload = e => runVerificationAnimated(file, e.target.result);
    reader.readAsText(file);
});

let selectedUploadFile = null;

document.getElementById("confirmUploadBtn").addEventListener("click", async () => {
    const formData = new FormData();
    formData.append("file", selectedUploadFile);

    try {
        const response = await fetch("/upload-dataset", { method: "POST", body: formData });
        const result = await response.json();

        // ── Duplicate dataset guard ────────────────────────────────────────
        if (response.status === 409 || result.error === "duplicate") {
            // Close modal
            document.getElementById("datasetRequirementsModal").classList.add("hidden");
            document.getElementById("datasetRequirementsModal").classList.remove("flex");

            // Clear the displayed/selected file since it was rejected
            selectedUploadFile = null;
            document.getElementById("datasetUpload").value = "";
            document.getElementById("selectedFileName").textContent = "No file selected";
            document.getElementById("uploadStatus").textContent = "";

            showDuplicateWarning();
            return;
        }

        document.getElementById("uploadStatus").textContent = result.message;

        toggleRevertButton(true);

        // Close modal
        document.getElementById("datasetRequirementsModal").classList.add("hidden");
        document.getElementById("datasetRequirementsModal").classList.remove("flex");

        // Show success popup
        showSuccessPopup("Dataset uploaded and integrated successfully.");

        // Clear the displayed/selected file now that it's been uploaded
        selectedUploadFile = null;
        document.getElementById("datasetUpload").value = "";
        document.getElementById("selectedFileName").textContent = "No file selected";

        // Real-time refresh of all data
        await Promise.all([
            loadLocations(),
            reloadMapAQI()
        ]);

        // Clear the status message after reload
        document.getElementById("uploadStatus").textContent = "";

    } catch (error) {
        document.getElementById("datasetRequirementsModal").classList.add("hidden");
        document.getElementById("datasetRequirementsModal").classList.remove("flex");

        // Clear the displayed/selected file on failure too
        selectedUploadFile = null;
        document.getElementById("datasetUpload").value = "";
        document.getElementById("selectedFileName").textContent = "No file selected";

        document.getElementById("uploadStatus").textContent = "Upload failed.";
    }
});

document.getElementById("cancelUploadBtn").addEventListener("click", () => {
    selectedUploadFile = null;
    document.getElementById("datasetUpload").value = "";
    document.getElementById("selectedFileName").textContent = "No file selected";
    document.getElementById("datasetRequirementsModal").classList.add("hidden");
    document.getElementById("datasetRequirementsModal").classList.remove("flex");
});

// ── Filename Warning Popup ────────────────────────────────────────────────────
function showFilenameWarning(actualName) {
    const existing = document.getElementById('filenameWarningPopup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'filenameWarningPopup';
    popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        z-index: 9999;
        background: #0a0a0a;
        border: 1px solid rgba(244,63,94,0.35);
        border-radius: 14px;
        padding: 28px 32px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
        text-align: center;
        box-shadow: 0 0 0 1px rgba(244,63,94,0.08), 0 20px 60px rgba(0,0,0,0.8);
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.92);
        transition: opacity 0.3s ease, transform 0.3s ease;
        min-width: 320px;
        max-width: 440px;
    `;

    popup.innerHTML = `
        <div style="
            width: 38px; height: 38px;
            border-radius: 50%;
            border: 2px solid rgba(244,63,94,0.4);
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0;
        ">
            <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                    stroke="#f43f5e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        <div>
            <p style="font-family:'JetBrains Mono',monospace; font-size:12px; color:#f43f5e; margin:0 0 6px; text-transform:uppercase; letter-spacing:0.05em;">
                Invalid Filename
            </p>
            <p style="font-size:13px; color:#ccc; margin:0 0 4px; line-height:1.5;">
                Your file must be named <span style="color:#f87171; font-family:'JetBrains Mono',monospace;">user_uploaded.csv</span>
            </p>
            <p style="font-size:11px; color:#666; font-family:'JetBrains Mono',monospace; margin:0;">
                Got: ${actualName}
            </p>
        </div>
    `;

    document.body.appendChild(popup);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            popup.style.opacity = '1';
            popup.style.transform = 'translate(-50%, -50%) scale(1)';
        });
    });

    setTimeout(() => {
        popup.style.opacity = '0';
        popup.style.transform = 'translate(-50%, -50%) scale(0.95)';
        setTimeout(() => popup.remove(), 400);
    }, 4000);
}

// ── Reload map AQI overlay without recreating the base tile layer ─────────────
async function reloadMapAQI() {
    // Remove existing country layer overlays
    Object.keys(countryLayers).forEach(key => {
        if (map.hasLayer(countryLayers[key])) {
            map.removeLayer(countryLayers[key]);
        }
    });
    countryLayers = {};

    // Reload fresh AQI country overlay
    await loadCountryAQIMap();
}

// ── Revert button ─────────────────────────────────────────────────────────────
async function checkUploadedDatasets() {
    try {
        const response = await fetch("/uploaded-dataset-count");
        if (!response.ok) return;
        const data = await response.json();
        toggleRevertButton(data.count > 0);
    } catch (e) {}
}

function toggleRevertButton(show) {
    const btn = document.getElementById("revertDatasetBtn");
    if (show) btn.classList.remove("hidden");
    else btn.classList.add("hidden");
}

checkUploadedDatasets();

document.getElementById("revertDatasetBtn").addEventListener("click", () => {
    document.getElementById("revertConfirmModal").classList.remove("hidden");
    document.getElementById("revertConfirmModal").classList.add("flex");
});

document.getElementById("cancelRevertBtn").addEventListener("click", () => {
    document.getElementById("revertConfirmModal").classList.add("hidden");
    document.getElementById("revertConfirmModal").classList.remove("flex");
});

document.getElementById("confirmRevertBtn").addEventListener("click", async () => {
    document.getElementById("revertConfirmModal").classList.add("hidden");
    document.getElementById("revertConfirmModal").classList.remove("flex");

    const statusEl = document.getElementById("uploadStatus");
    statusEl.textContent = "Reverting...";
    statusEl.className = "mt-4 text-sm text-amber-400";

    try {
        const response = await fetch("/revert-dataset", { method: "POST" });
        const result = await response.json();

        statusEl.textContent = result.message || "Reverted to original dataset.";
        statusEl.className = "mt-4 text-sm text-emerald-400";

        toggleRevertButton(false);

        document.getElementById("selectedFileName").textContent = "No file selected";
        document.getElementById("datasetUpload").value = "";

        // Show success popup
        showSuccessPopup("Dataset reverted to original successfully.");

        // Real-time refresh of all data
        await Promise.all([
            loadLocations(),
            reloadMapAQI()
        ]);

        // Clear the status message after reload
        statusEl.textContent = "";
        statusEl.className = "mt-4 text-sm text-brand-textMuted";

    } catch (error) {
        statusEl.textContent = "Revert failed. Please try again.";
        statusEl.className = "mt-4 text-sm text-rose-400";
    }
});

function showDuplicateWarning() {
    const existing = document.getElementById('duplicateWarningPopup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'duplicateWarningPopup';
    popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        z-index: 9999;
        background: #0a0a0a;
        border: 1px solid rgba(244,63,94,0.35);
        border-radius: 14px;
        padding: 28px 32px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
        text-align: center;
        box-shadow: 0 0 0 1px rgba(244,63,94,0.08), 0 20px 60px rgba(0,0,0,0.8);
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.92);
        transition: opacity 0.3s ease, transform 0.3s ease;
        min-width: 320px;
        max-width: 440px;
    `;

    popup.innerHTML = `
        <div style="
            width: 38px; height: 38px;
            border-radius: 50%;
            border: 2px solid rgba(244,63,94,0.4);
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0;
        ">
            <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                    stroke="#f43f5e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        <div>
            <p style="font-family:'JetBrains Mono',monospace; font-size:12px; color:#f43f5e; margin:0 0 6px; text-transform:uppercase; letter-spacing:0.05em;">
                Duplicate Dataset
            </p>
            <p style="font-size:13px; color:#ccc; margin:0; line-height:1.5;">
                You cannot upload the same CSV file. This dataset has already been uploaded.
            </p>
        </div>
    `;

    document.body.appendChild(popup);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            popup.style.opacity = '1';
            popup.style.transform = 'translate(-50%, -50%) scale(1)';
        });
    });

    setTimeout(() => {
        popup.style.opacity = '0';
        popup.style.transform = 'translate(-50%, -50%) scale(0.95)';
        setTimeout(() => popup.remove(), 400);
    }, 4000);
}