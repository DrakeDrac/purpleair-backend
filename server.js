const express = require('express');
const cors = require('cors');
require('dotenv').config();

if (!process.env.JWT_SECRET) {
  console.warn('Warning: JWT_SECRET is not set. Using default secret (not recommended for production).');
  process.env.JWT_SECRET = 'default-secret-change-in-production';
}

const app = express();
const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Authorization'],
  optionsSuccessStatus: 200,
  preflightContinue: false
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const authRoutes = require('./routes/auth');
const purpleAirRoutes = require('./routes/purpleair');
const aiRoutes = require('./routes/ai');
const locationRoutes = require('./routes/location');

app.use('/api/auth', authRoutes);
app.use('/api/purpleair', purpleAirRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/location', locationRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Weather App Backend is running' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      status: err.status || 500
    }
  });
});

app.use((req, res) => {
  res.status(404).json({ error: { message: 'Route not found', status: 404 } });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

