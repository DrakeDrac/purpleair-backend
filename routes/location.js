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
        const { lat, lon } = req.query;

        if (!lat || !lon) {
            return res.status(400).json({ error: { message: 'lat and lon are required', status: 400 } });
        }

        // Parallel requests: Weather + Reverse Geo

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
                timezone: 'auto' // Get local time
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

        // 3. Reverse Geocoding
        const geoPromise = axios.get('https://api.bigdatacloud.net/data/reverse-geocode-client', {
            params: {
                latitude: lat,
                longitude: lon,
                localityLanguage: 'en'
            }
        });

        const [weatherRes, aqiRes, geoRes] = await Promise.all([weatherPromise, aqiPromise, geoPromise]);

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

        const city = geoRes.data.city || geoRes.data.locality || geoRes.data.principalSubdivision || "Unknown Location";

        const result = {
            location: {
                city: city,
                latitude: parseFloat(lat),
                longitude: parseFloat(lon),
                country: geoRes.data.countryName,
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

        res.json(result);

    } catch (error) {
        console.error('Weather error:', error.message);
        res.status(500).json({ error: { message: 'Failed to fetch weather data', status: 500 } });
    }
});

module.exports = router;
