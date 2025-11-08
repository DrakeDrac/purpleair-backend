const express = require('express');
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

const PURPLEAIR_API_KEY = process.env.PURPLEAIR_API_KEY;
const PURPLEAIR_BASE_URL = process.env.PURPLEAIR_API_BASE_URL || 'https://api.purpleair.com/v1';

router.use(authenticateToken);

router.get('/sensors', async (req, res) => {
  try {
    if (!PURPLEAIR_API_KEY) {
      return res.status(500).json({
        error: { message: 'PurpleAir API key not configured', status: 500 }
      });
    }

    const params = { ...req.query };
    
    if (!params.fields) {
      params.fields = 'sensor_index,name,latitude,longitude,pm2.5,pm2.5_10minute,pm2.5_30minute,pm2.5_60minute,pm2.5_24hour,pm2.5_atm,pm2.5_cf_1,temperature,humidity,pressure,last_seen';
    }
    
    const response = await axios.get(`${PURPLEAIR_BASE_URL}/sensors`, {
      params: params,
      headers: {
        'X-API-Key': PURPLEAIR_API_KEY
      }
    });

    res.json(response.data);
  } catch (error) {
    const errorData = error.response?.data || {};
    const statusCode = error.response?.status || 500;
    
    if (statusCode >= 400 && statusCode < 500) {
      console.log(`PurpleAir API client error (${statusCode}):`, errorData.error || errorData.description);
    } else {
      console.error('PurpleAir API error:', error.response?.data || error.message);
    }
    
    res.status(statusCode).json({
      error: {
        message: errorData.description || errorData.error || 'Failed to fetch sensors from PurpleAir',
        type: errorData.error || 'APIError',
        status: statusCode,
        api_version: errorData.api_version,
        time_stamp: errorData.time_stamp
      }
    });
  }
});

router.get('/sensors/:sensor_index', async (req, res) => {
  try {
    if (!PURPLEAIR_API_KEY) {
      return res.status(500).json({
        error: { message: 'PurpleAir API key not configured', status: 500 }
      });
    }

    const { sensor_index } = req.params;
    const params = { ...req.query };
    
    if (!params.fields) {
      params.fields = 'sensor_index,name,latitude,longitude,pm2.5,pm2.5_10minute,pm2.5_30minute,pm2.5_60minute,pm2.5_24hour,pm2.5_atm,pm2.5_cf_1,temperature,humidity,pressure,last_seen';
    }
    
    const response = await axios.get(`${PURPLEAIR_BASE_URL}/sensors/${sensor_index}`, {
      params: params,
      headers: {
        'X-API-Key': PURPLEAIR_API_KEY
      }
    });

    res.json(response.data);
  } catch (error) {
    const errorData = error.response?.data || {};
    const statusCode = error.response?.status || 500;
    
    if (errorData.error === 'NotFoundError' || statusCode === 404) {
      console.log(`Sensor ${req.params.sensor_index} not found`);
      return res.status(404).json({
        error: {
          message: `Sensor with index ${req.params.sensor_index} not found`,
          type: 'NotFoundError',
          status: 404,
          api_version: errorData.api_version,
          time_stamp: errorData.time_stamp
        }
      });
    }
    
    console.error('PurpleAir API error:', error.response?.data || error.message);
    
    res.status(statusCode).json({
      error: {
        message: errorData.description || errorData.error || 'Failed to fetch sensor data from PurpleAir',
        type: errorData.error || 'APIError',
        status: statusCode,
        api_version: errorData.api_version,
        time_stamp: errorData.time_stamp
      }
    });
  }
});

router.get('/sensors/:sensor_index/history', async (req, res) => {
  try {
    if (!PURPLEAIR_API_KEY) {
      return res.status(500).json({
        error: { message: 'PurpleAir API key not configured', status: 500 }
      });
    }

    const { sensor_index } = req.params;
    const params = { ...req.query };
    
    if (!params.fields) {
      params.fields = 'time_stamp,pm2.5,pm2.5_atm,pm2.5_cf_1,temperature,humidity,pressure';
    }
    
    if (!params.start_timestamp || !params.end_timestamp) {
      return res.status(400).json({
        error: {
          message: 'start_timestamp and end_timestamp are required',
          status: 400
        }
      });
    }
    
    const response = await axios.get(`${PURPLEAIR_BASE_URL}/sensors/${sensor_index}/history`, {
      params: params,
      headers: {
        'X-API-Key': PURPLEAIR_API_KEY
      }
    });

    res.json(response.data);
  } catch (error) {
    const errorData = error.response?.data || {};
    const statusCode = error.response?.status || 500;
    
    if (errorData.error === 'NotFoundError' || statusCode === 404) {
      console.log(`Sensor ${req.params.sensor_index} not found for history request`);
      return res.status(404).json({
        error: {
          message: `Sensor with index ${req.params.sensor_index} not found`,
          type: 'NotFoundError',
          status: 404,
          api_version: errorData.api_version,
          time_stamp: errorData.time_stamp
        }
      });
    }
    
    console.error('PurpleAir API error:', error.response?.data || error.message);
    
    res.status(statusCode).json({
      error: {
        message: errorData.description || errorData.error || 'Failed to fetch sensor history from PurpleAir',
        type: errorData.error || 'APIError',
        status: statusCode,
        api_version: errorData.api_version,
        time_stamp: errorData.time_stamp
      }
    });
  }
});

router.get('/sensors/:sensor_index/history/csv', async (req, res) => {
  try {
    if (!PURPLEAIR_API_KEY) {
      return res.status(500).json({
        error: { message: 'PurpleAir API key not configured', status: 500 }
      });
    }

    const { sensor_index } = req.params;
    const params = { ...req.query };
    
    if (!params.fields) {
      params.fields = 'time_stamp,pm2.5,pm2.5_atm,pm2.5_cf_1,temperature,humidity,pressure';
    }
    
    if (!params.start_timestamp || !params.end_timestamp) {
      return res.status(400).json({
        error: {
          message: 'start_timestamp and end_timestamp are required',
          status: 400
        }
      });
    }
    
    const response = await axios.get(`${PURPLEAIR_BASE_URL}/sensors/${sensor_index}/history/csv`, {
      params: params,
      headers: {
        'X-API-Key': PURPLEAIR_API_KEY
      },
      responseType: 'text'
    });

    res.setHeader('Content-Type', 'text/csv');
    res.send(response.data);
  } catch (error) {
    const errorData = error.response?.data || {};
    const statusCode = error.response?.status || 500;
    
    if (errorData.error === 'NotFoundError' || statusCode === 404) {
      console.log(`Sensor ${req.params.sensor_index} not found for history CSV request`);
      return res.status(404).json({
        error: {
          message: `Sensor with index ${req.params.sensor_index} not found`,
          type: 'NotFoundError',
          status: 404,
          api_version: errorData.api_version,
          time_stamp: errorData.time_stamp
        }
      });
    }
    
    console.error('PurpleAir API error:', error.response?.data || error.message);
    
    res.status(statusCode).json({
      error: {
        message: errorData.description || errorData.error || 'Failed to fetch sensor history CSV from PurpleAir',
        type: errorData.error || 'APIError',
        status: statusCode,
        api_version: errorData.api_version,
        time_stamp: errorData.time_stamp
      }
    });
  }
});

router.get('/groups', async (req, res) => {
  try {
    if (!PURPLEAIR_API_KEY) {
      return res.status(500).json({
        error: { message: 'PurpleAir API key not configured', status: 500 }
      });
    }

    const params = { ...req.query };
    
    if (!params.fields) {
      params.fields = 'group_id,name,description,sensor_count,created,modified';
    }
    
    const response = await axios.get(`${PURPLEAIR_BASE_URL}/groups`, {
      params: params,
      headers: {
        'X-API-Key': PURPLEAIR_API_KEY
      }
    });

    res.json(response.data);
  } catch (error) {
    const errorData = error.response?.data || {};
    const statusCode = error.response?.status || 500;
    
    if (statusCode >= 400 && statusCode < 500) {
      console.log(`PurpleAir API client error (${statusCode}):`, errorData.error || errorData.description);
    } else {
      console.error('PurpleAir API error:', error.response?.data || error.message);
    }
    
    res.status(statusCode).json({
      error: {
        message: errorData.description || errorData.error || 'Failed to fetch groups from PurpleAir',
        type: errorData.error || 'APIError',
        status: statusCode,
        api_version: errorData.api_version,
        time_stamp: errorData.time_stamp
      }
    });
  }
});

module.exports = router;

