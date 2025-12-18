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

        let weatherData;
        const normalizedSource = api_source.replace(/\./g, '').toLowerCase();

        if (normalizedSource === 'metno') {
            weatherData = await fetchMetNoWeather(lat, lon);
        } else {
            // Default to OpenMeteo
            weatherData = await fetchOpenMeteoWeather(lat, lon);
        }

        // Shared Reverse Geocoding
        const geoPromise = axios.get('https://api.bigdatacloud.net/data/reverse-geocode-client', {
            params: {
                latitude: lat,
                longitude: lon,
                localityLanguage: 'en'
            }
        });

        const [weatherResult, geoRes] = await Promise.all([weatherData, geoPromise]);

        const city = geoRes.data.city || geoRes.data.locality || geoRes.data.principalSubdivision || "Unknown Location";

        const result = {
            location: {
                city: city,
                latitude: parseFloat(lat),
                longitude: parseFloat(lon),
                country: geoRes.data.countryName,
                ...weatherResult.location
            },
            weather: weatherResult.weather,
            air_quality: weatherResult.air_quality,
            source: weatherResult.source
        };

        res.json(result);

    } catch (error) {
        console.error('Weather error:', error.message);
        res.status(500).json({ error: { message: 'Failed to fetch weather data', status: 500 } });
    }
});

// 3. Get Available API Sources
router.get('/sources', (req, res) => {
    res.json({
        sources: [
            { id: 'OpenMeteo', name: 'Open-Meteo (Default)' },
            { id: 'Met.no', name: 'Met.no (Yr.no)' }
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

module.exports = router;
