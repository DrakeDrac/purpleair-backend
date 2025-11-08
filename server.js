const express = require('express');
const cors = require('cors');
require('dotenv').config();

if (!process.env.JWT_SECRET) {
  console.warn('Warning: JWT_SECRET is not set. Using default secret (not recommended for production).');
  process.env.JWT_SECRET = 'default-secret-change-in-production';
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const authRoutes = require('./routes/auth');
const purpleAirRoutes = require('./routes/purpleair');
const aiRoutes = require('./routes/ai');

app.use('/api/auth', authRoutes);
app.use('/api/purpleair', purpleAirRoutes);
app.use('/api/ai', aiRoutes);

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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

