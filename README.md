# Weather App Backend

A Node.js backend API service for a weather application that uses PurpleAir API for air quality data and includes placeholder routes for AI integration via OpenRouter.

## Features

- **Authentication**: JWT-based authentication system
- **PurpleAir API Integration**: Proxy routes that hide the API key from clients
- **AI Integration Routes**: Placeholder endpoints for future OpenRouter integration
- **Error Handling**: Comprehensive error handling middleware
- **CORS Support**: Cross-origin resource sharing enabled

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- PurpleAir API key (get one from [PurpleAir](https://www2.purpleair.com/community/faq#hc-accessing-the-api))

## Installation

1. Clone the repository and navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```bash
cp .env.example .env
```

4. Update the `.env` file with your configuration:
```env
PORT=3000
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
PURPLEAIR_API_KEY=your-purpleair-api-key-here
PURPLEAIR_API_BASE_URL=https://api.purpleair.com/v1
OPENROUTER_API_KEY=your-openrouter-api-key-here
OPENROUTER_API_BASE_URL=https://openrouter.ai/api/v1
DEFAULT_USERNAME=admin
DEFAULT_PASSWORD=admin123
```

## Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified in your `.env` file).

## API Endpoints

### Authentication

#### POST `/api/auth/login`
Authenticate user and receive JWT token.

**Request Body:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "admin"
  }
}
```

#### POST `/api/auth/register`
Register a new user.

**Request Body:**
```json
{
  "username": "newuser",
  "password": "password123"
}
```

#### GET `/api/auth/me`
Get current user information (requires authentication).

**Headers:**
```
Authorization: Bearer <token>
```

### PurpleAir API (All endpoints require authentication)

#### GET `/api/purpleair/sensors`
Get list of sensors.

**Query Parameters:**
- `fields`: Comma-separated list of field names
- `location_type`: Filter by location type (0 = outside, 1 = inside)
- `read_keys`: Comma-separated list of read keys
- `show_only`: Filter by sensor index
- `modified_since`: Unix timestamp
- `max_age`: Maximum age in seconds
- `nwlng`, `nwlat`, `selng`, `selat`: Bounding box coordinates

**Example:**
```bash
curl -X GET "http://localhost:3000/api/purpleair/sensors?fields=name,pm2.5,latitude,longitude&location_type=0" \
  -H "Authorization: Bearer <token>"
```

#### GET `/api/purpleair/sensors/:sensor_index`
Get specific sensor data by index.

**Query Parameters:**
- `fields`: Comma-separated list of field names
- `read_key`: Read key for private sensors

#### GET `/api/purpleair/sensors/:sensor_index/history`
Get historical data for a sensor.

**Query Parameters:**
- `start_timestamp`: Unix timestamp (required)
- `end_timestamp`: Unix timestamp (required)
- `average`: Average period in minutes
- `fields`: Comma-separated list of field names
- `read_key`: Read key for private sensors

#### GET `/api/purpleair/sensors/:sensor_index/history/csv`
Get historical data in CSV format.

#### GET `/api/purpleair/groups`
Get list of groups.

**Query Parameters:**
- `fields`: Comma-separated list of field names
- `group_id`: Filter by group ID

### AI Integration (Placeholder routes - require authentication)

#### POST `/api/ai/chat`
Chat endpoint for AI integration (placeholder).

**Request Body:**
```json
{
  "message": "Hello, AI!",
  "model": "openai/gpt-3.5-turbo",
  "temperature": 0.7
}
```

#### POST `/api/ai/completions`
Text completion endpoint (placeholder).

**Request Body:**
```json
{
  "prompt": "Complete this sentence...",
  "model": "openai/gpt-3.5-turbo",
  "max_tokens": 100,
  "temperature": 0.7
}
```

#### GET `/api/ai/models`
Get list of available AI models (placeholder).

#### POST `/api/ai/analyze-weather`
Analyze weather data using AI (placeholder).

**Request Body:**
```json
{
  "sensor_data": { ... },
  "analysis_type": "general",
  "model": "openai/gpt-3.5-turbo"
}
```

### Health Check

#### GET `/health`
Check if the server is running.

**Response:**
```json
{
  "status": "ok",
  "message": "Weather App Backend is running"
}
```

## Authentication

All PurpleAir and AI endpoints require authentication. Include the JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Error Handling

The API returns errors in the following format:

```json
{
  "error": {
    "message": "Error message",
    "status": 400
  }
}
```

## Testing

A comprehensive test script is provided to test all API endpoints. Make sure the server is running before executing the tests.

### Run Tests

```bash
./test.sh
```

Or specify a custom base URL:

```bash
BASE_URL=http://localhost:3000 ./test.sh
```

The test script will:
- Test health check endpoint
- Test authentication (login, register, get current user)
- Test protected endpoints (PurpleAir and AI routes)
- Test error handling (invalid credentials, missing fields, etc.)
- Provide a summary of passed/failed tests

## Future Improvements

- [ ] Implement OpenRouter API integration for AI endpoints
- [ ] Add database for user management
- [ ] Add rate limiting
- [ ] Add request validation middleware
- [ ] Add API documentation with Swagger/OpenAPI
- [ ] Add unit and integration tests
- [ ] Add logging with Winston or similar
- [ ] Add caching for PurpleAir API responses

## License

ISC

