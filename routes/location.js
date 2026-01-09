const express = require('express');
const axios = require('axios');
const router = express.Router();
// Note: Location routes are public (no auth required) to allow initial setup/search

// 1. Search for cities 
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;

        if (!q) {
            return res.status(400).json({ error: { message: 'Query parameter "q" is required', status: 400 } });
        }

        // OpenMeteo Geocoding API
        const response = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
            params: {
                name: q,
                count: 5,
                language: 'en',
                format: 'json'
            }
        });

        if (!response.data.results) {
            return res.json({ results: [] });
        }

        // Format results
        const results = response.data.results.map(item => ({
            id: item.id,
            name: item.name,
            latitude: item.latitude,
            longitude: item.longitude,
            country: item.country,
            admin1: item.admin1, // State/Region
            timezone: item.timezone || "UTC"
        }));

        res.json({ results });

    } catch (error) {
        console.error('Geocoding error:', error.response?.data || error.message);
        res.status(500).json({ error: { message: 'Failed to search for cities', status: 500 } });
    }
});

// 2. Get Weather & City Name by Lat/Lon
router.get('/weather', async (req, res) => {
    try {
        const { lat, lon, api_source = 'OpenMeteo' } = req.query;

        if (!lat || !lon) {
            return res.status(400).json({ error: { message: 'lat and lon are required', status: 400 } });
        }

        // Prepare promises for all sources
        const sources = [
            { id: 'OpenMeteo', promise: fetchOpenMeteoWeather(lat, lon) },
            { id: 'Met.no', promise: fetchMetNoWeather(lat, lon) },
            { id: 'PurpleAir', promise: fetchPurpleAirWeather(lat, lon) }
        ];

        // Shared Reverse Geocoding
        const geoPromise = axios.get('https://api.bigdatacloud.net/data/reverse-geocode-client', {
            params: {
                latitude: lat,
                longitude: lon,
                localityLanguage: 'en'
            }
        });

        // Execute all requests in parallel
        const [results, geoRes] = await Promise.all([
            Promise.allSettled(sources.map(s => s.promise)),
            geoPromise
        ]);

        // Process weather results
        const sourcesData = [];
        let mainWeatherData = null;

        results.forEach((result, index) => {
            const sourceInfo = sources[index];
            if (result.status === 'fulfilled') {
                sourcesData.push(result.value);
            } else {
                console.error(`${sourceInfo.id} failed:`, result.reason?.message || result.reason);
                sourcesData.push({
                    source: sourceInfo.id,
                    error: 'Failed to fetch data'
                });
            }
        });

        // Determine main source data based on request or default
        // Normalize input source to match keys (remove dots, lowercase check if needed, but keys are clean here)
        // Actually our keys are 'OpenMeteo', 'Met.no', 'PurpleAir'
        // Input 'api_source' might be "Met.no" or "OpenMeteo"
        // Let's try to find an exact match or fallback
        const requestedSourceId = sources.find(s => s.id.toLowerCase().replace('.', '') === api_source.toLowerCase().replace('.', ''))?.id || 'OpenMeteo';

        mainWeatherData = sourcesData.find(d => d.source === requestedSourceId && !d.error);

        if (!mainWeatherData) {
            // If requested fails, try OpenMeteo, then first available
            mainWeatherData = sourcesData.find(d => d.source === 'OpenMeteo' && !d.error);
            if (!mainWeatherData) {
                mainWeatherData = sourcesData.find(d => !d.error);
            }
        }

        if (!mainWeatherData) {
            throw new Error('All weather sources failed');
        }

        const city = geoRes.data.city || geoRes.data.locality || geoRes.data.principalSubdivision || "Unknown Location";

        const result = {
            location: {
                city: city,
                latitude: parseFloat(lat),
                longitude: parseFloat(lon),
                country: geoRes.data.countryName,
                ...mainWeatherData.location
            },
            weather: mainWeatherData.weather,
            air_quality: mainWeatherData.air_quality,
            source: mainWeatherData.source,
            sources_data: sourcesData
        };

        res.json(result);

    } catch (error) {
        console.error('Weather error:', error.message);
        res.status(500).json({ error: { message: 'Failed to fetch weather data', status: 500 } });
    }
});

// 4. Get Weather by Specific PurpleAir Sensor ID
router.get('/weather/purpleair/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ error: { message: 'Sensor ID is required', status: 400 } });
        }

        const sensorData = await fetchPurpleAirSensorById(id);

        // Perform reverse geocoding for the sensor location
        const geoRes = await axios.get('https://api.bigdatacloud.net/data/reverse-geocode-client', {
            params: {
                latitude: sensorData.location.latitude,
                longitude: sensorData.location.longitude,
                localityLanguage: 'en'
            }
        });

        const city = geoRes.data.city || geoRes.data.locality || geoRes.data.principalSubdivision || "Unknown Location";

        const result = {
            location: {
                city: city,
                latitude: sensorData.location.latitude,
                longitude: sensorData.location.longitude,
                country: geoRes.data.countryName,
                ...sensorData.location
            },
            weather: sensorData.weather,
            air_quality: sensorData.air_quality,
            source: sensorData.source,
            sources_data: [sensorData] // Only one source for this specific route
        };

        res.json(result);

    } catch (error) {
        console.error('PurpleAir sensor error:', error.message);
        const status = error.response?.status || 500;
        res.status(status).json({ error: { message: error.message || 'Failed to fetch sensor data', status: status } });
    }
});

// 3. Get Available API Sources
router.get('/sources', (req, res) => {
    res.json({
        sources: [
            { id: 'OpenMeteo', name: 'Open-Meteo (Default)' },
            { id: 'Met.no', name: 'Met.no (Yr.no)' },
            { id: 'PurpleAir', name: 'PurpleAir (Local Sensors)' }
        ]
    });
});

// --- Helper Functions ---

async function fetchOpenMeteoWeather(lat, lon) {
    // 1. Weather from OpenMeteo
    const weatherPromise = axios.get('https://api.open-meteo.com/v1/forecast', {
        params: {
            latitude: lat,
            longitude: lon,
            current: 'temperature_2m,relative_humidity_2m,weather_code,is_day,precipitation,rain,showers,snowfall,apparent_temperature,wind_speed_10m,cloud_cover,visibility',
            daily: 'temperature_2m_max,temperature_2m_min',
            forecast_days: 1,
            temperature_unit: 'fahrenheit',
            wind_speed_unit: 'mph',
            precipitation_unit: 'inch',
            timezone: 'auto'
        }
    });

    // 2. Air Quality from OpenMeteo
    const aqiPromise = axios.get('https://air-quality-api.open-meteo.com/v1/air-quality', {
        params: {
            latitude: lat,
            longitude: lon,
            current: 'us_aqi,pm10,pm2_5,uv_index',
            timezone: 'auto'
        }
    });

    const [weatherRes, aqiRes] = await Promise.all([weatherPromise, aqiPromise]);

    const wData = weatherRes.data.current;
    const dData = weatherRes.data.daily;
    const aData = aqiRes.data.current;
    const wUnits = weatherRes.data.current_units;
    const dUnits = weatherRes.data.daily_units;

    // Map WMO codes to string description
    const weatherCode = wData.weather_code;
    let condition = "Unknown";
    if (weatherCode === 0) condition = "Clear sky";
    else if (weatherCode <= 3) condition = "Cloudy";
    else if (weatherCode <= 49) condition = "Foggy";
    else if (weatherCode <= 59) condition = "Drizzle";
    else if (weatherCode <= 69) condition = "Raining";
    else if (weatherCode <= 79) condition = "Snowing";
    else if (weatherCode <= 84) condition = "Rain showers";
    else if (weatherCode <= 94) condition = "Snow showers";
    else if (weatherCode >= 95) condition = "Thunderstorm";

    return {
        location: {
            timezone: weatherRes.data.timezone,
            timezone_abbreviation: weatherRes.data.timezone_abbreviation,
            local_time: wData.time // "YYYY-MM-DDTHH:mm" in local time
        },
        weather: {
            temperature: `${wData.temperature_2m}${wUnits.temperature_2m}`,
            feels_like: `${wData.apparent_temperature}${wUnits.apparent_temperature}`,
            humidity: `${wData.relative_humidity_2m}${wUnits.relative_humidity_2m}`,
            condition: condition,
            is_day: wData.is_day === 1,
            precipitation: wData.precipitation,
            snowfall: wData.snowfall,
            wind_speed: `${wData.wind_speed_10m} ${wUnits.wind_speed_10m}`,
            cloud_cover: `${wData.cloud_cover}${wUnits.cloud_cover}`,
            visibility: `${wData.visibility} ${wUnits.visibility}`,
            temp_max: `${dData.temperature_2m_max[0]}${dUnits.temperature_2m_max}`,
            temp_min: `${dData.temperature_2m_min[0]}${dUnits.temperature_2m_min}`
        },
        air_quality: {
            aqi: aData.us_aqi,
            pm2_5: aData.pm2_5,
            pm10: aData.pm10,
            uv_index: aData.uv_index
        },
        source: "OpenMeteo"
    };
}


async function fetchMetNoWeather(lat, lon) {
    // Met.no requires User-Agent
    const response = await axios.get('https://api.met.no/weatherapi/locationforecast/2.0/compact', {
        headers: {
            'User-Agent': 'WeatherApp/1.0 (github.com/yash/weather-pa)'
        },
        params: {
            lat: lat,
            lon: lon
        }
    });

    const data = response.data.properties;
    const current = data.timeseries[0].data.instant.details;
    const next1Hour = data.timeseries[0].data.next_1_hours?.details;
    const next1HourSummary = data.timeseries[0].data.next_1_hours?.summary?.symbol_code;

    // Units are metric (Celsius, m/s). Convert to standard app units (Fahrenheit, mph)
    const cToF = (c) => (c * 9 / 5 + 32).toFixed(1);
    const msToMph = (ms) => (ms * 2.23694).toFixed(1);

    const conditionMap = {
        "clearsky": "Clear sky",
        "cloudy": "Cloudy",
        "fair": "Partly Cloudy",
        "fog": "Foggy",
        "rain": "Raining",
        "snow": "Snowing",
        "sleet": "Sleet",
        "thunder": "Thunderstorm",
        "lightrain": "Drizzle",
        "heavyrain": "Heavy Rain"
        // Simplified mapping, real list is longer
    };

    // Naive mapping of symbol_code
    let condition = "Unknown";
    if (next1HourSummary) {
        const base = next1HourSummary.split('_')[0]; // remove _day/_night
        condition = conditionMap[base] || base.replace(/_/g, ' ');
        condition = condition.charAt(0).toUpperCase() + condition.slice(1);
    }

    return {
        location: {
            timezone: "UTC", // Met.no uses UTC
            timezone_abbreviation: "UTC",
            local_time: data.timeseries[0].time
        },
        weather: {
            temperature: `${cToF(current.air_temperature)}°F`,
            feels_like: `${cToF(current.air_temperature)}°F`, // Approximation as Met.no simple doesn't give apparent temp easily
            humidity: `${current.relative_humidity}%`,
            condition: condition,
            // is_day calculation is complex without local time/sunset, defaulting to null or simple check
            is_day: true, // Placeholder
            precipitation: next1Hour ? next1Hour.precipitation_amount : 0,
            snowfall: 0, // Not explicitly separate in compact
            wind_speed: `${msToMph(current.wind_speed)} mph`,
            cloud_cover: `${current.cloud_area_fraction}%`,
            visibility: "N/A", // Not provided in compact
            temp_max: "N/A", // Requires daily forecast parsing
            temp_min: "N/A"
        },
        air_quality: {
            aqi: "N/A", // Met.no doesn't provide global AQI here
            pm2_5: "N/A",
            pm10: "N/A",
            uv_index: "N/A"
        },
        source: "Met.no"
    };
}

async function fetchPurpleAirWeather(lat, lon) {
    const apiKey = process.env.PURPLEAIR_API_KEY;
    if (!apiKey) {
        throw new Error('PurpleAir API Key missing');
    }


    // Define bounding box (approx +/- 0.5 degrees)
    // 1 deg lat ~ 69 miles, 0.5 deg ~ 35 miles radius rough box
    const radiusDeg = 0.2; // Smaller radius to reduce data load, maybe 0.2 (~14 miles)
    const nwlat = parseFloat(lat) + radiusDeg;
    const nwlng = parseFloat(lon) - radiusDeg;
    const selat = parseFloat(lat) - radiusDeg;
    const selng = parseFloat(lon) + radiusDeg;

    const response = await axios.get('https://api.purpleair.com/v1/sensors', {
        headers: {
            'X-API-Key': apiKey
        },
        params: {
            fields: 'name,latitude,longitude,temperature,humidity,pm2.5_atm',
            nwlat: nwlat,
            nwlng: nwlng,
            selat: selat,
            selng: selng,
            location_type: 0 // Outside sensors only
        }
    });

    const data = response.data;
    if (!data.data || data.data.length === 0) {
        throw new Error('No PurpleAir sensors found in area');
    }

    // Fields indices
    const fields = data.fields; // ["latitude", "longitude", "name", ...]
    const idxLat = fields.indexOf('latitude');
    const idxLon = fields.indexOf('longitude');
    const idxName = fields.indexOf('name');
    const idxTemp = fields.indexOf('temperature');
    const idxHum = fields.indexOf('humidity');
    const idxPm25 = fields.indexOf('pm2.5_atm');

    // Find closest sensor
    let minDist = Infinity;
    let closestSensor = null;

    for (const sensor of data.data) {
        const sLat = sensor[idxLat];
        const sLon = sensor[idxLon];
        if (sLat === null || sLon === null) continue;

        const dist = getDistanceFromLatLonInKm(lat, lon, sLat, sLon);
        if (dist < minDist) {
            minDist = dist;
            closestSensor = sensor;
        }
    }

    if (!closestSensor) {
        throw new Error('No valid PurpleAir sensors found');
    }

    // Format data
    const tempF = closestSensor[idxTemp];
    const humidity = closestSensor[idxHum];
    const pm25 = closestSensor[idxPm25];

    // Calculate AQI from PM2.5
    const aqi = calculateUS_AQI(pm25);

    // Condition estimation (PurpleAir only gives basic data, so we guess based on humidity/temp or just say "Unknown" or "Clear")
    // Actually, we can't really know if it's raining from just temp/humidity/pm2.5 easily.
    // We'll leave condition as "N/A" or "Unknown" or maybe just assume "Clear" if no other info.
    // Better to state "Observed" or "N/A".
    const condition = "N/A";

    return {
        location: {
            timezone: "Local",
            timezone_abbreviation: "LCL",
            local_time: new Date().toISOString() // PurpleAir doesn't give local time, use server/client time or approx
        },
        weather: {
            temperature: `${tempF}°F`,
            feels_like: `${tempF}°F`, // No wind/sun data for heat index
            humidity: `${humidity}%`,
            condition: condition,
            is_day: true, // Placeholder
            precipitation: 0,
            snowfall: 0,
            wind_speed: "N/A",
            cloud_cover: "N/A",
            visibility: "N/A",
            temp_max: "N/A",
            temp_min: "N/A"
        },
        air_quality: {
            aqi: aqi,
            pm2_5: pm25,
            pm10: "N/A",
            uv_index: "N/A"
        },
        source: `PurpleAir (${closestSensor[idxName]})`
    };
}

async function fetchPurpleAirSensorById(sensorIndex) {
    const apiKey = process.env.PURPLEAIR_API_KEY;
    if (!apiKey) {
        throw new Error('PurpleAir API Key missing');
    }

    const response = await axios.get(`https://api.purpleair.com/v1/sensors/${sensorIndex}`, {
        headers: {
            'X-API-Key': apiKey
        },
        params: {
            fields: 'name,latitude,longitude,temperature,humidity,pm2.5_atm'
        }
    });

    const data = response.data;
    if (!data.sensor) {
        throw new Error('Sensor data not found');
    }

    const sensor = data.sensor;

    // Log the sensor keys for debugging
    console.log('PurpleAir Sensor Data:', Object.keys(sensor));

    // Calculate AQI
    // Note: Field name usually has a dot e.g. "pm2.5_atm"
    const pm25 = sensor['pm2.5_atm'] || sensor.pm2_5_atm || 0;
    const aqi = calculateUS_AQI(pm25);
    const condition = "N/A"; // Or infer from AQI?

    return {
        location: {
            timezone: "Local",
            timezone_abbreviation: "LCL",
            local_time: new Date().toISOString(),
            latitude: sensor.latitude,
            longitude: sensor.longitude
        },
        weather: {
            temperature: `${sensor.temperature}°F`,
            feels_like: `${sensor.temperature}°F`,
            humidity: `${sensor.humidity}%`,
            condition: condition,
            is_day: true, // Placeholder
            precipitation: 0,
            snowfall: 0,
            wind_speed: "N/A",
            cloud_cover: "N/A",
            visibility: "N/A",
            temp_max: "N/A",
            temp_min: "N/A"
        },
        air_quality: {
            aqi: aqi,
            pm2_5: pm25,
            pm10: "N/A",
            uv_index: "N/A"
        },
        source: `PurpleAir (${sensor.name})`,
        // Include raw data for consistency if needed, but structure above covers main parts
    };
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);  // deg2rad below
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
        ;
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180)
}

function calculateUS_AQI(pm25) {
    if (pm25 < 0) return 0;
    if (pm25 > 500.4) return 500; // Cap

    const breakpoints = [
        { cLow: 0.0, cHigh: 12.0, iLow: 0, iHigh: 50 },
        { cLow: 12.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
        { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
        { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
        { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
        { cLow: 250.5, cHigh: 350.4, iLow: 301, iHigh: 400 },
        { cLow: 350.5, cHigh: 500.4, iLow: 401, iHigh: 500 }
    ];

    const bp = breakpoints.find(b => pm25 >= b.cLow && pm25 <= b.cHigh);
    if (!bp) return 500; // Should be caught by cap or falls in gaps? (Gaps shouldn't exist ideally but floating point)

    return Math.round(
        ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (pm25 - bp.cLow) + bp.iLow
    );
}

module.exports = router;
