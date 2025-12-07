const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();

const users = [];

(async () => {
  const defaultUsername = process.env.DEFAULT_USERNAME || 'admin@myapp.com';
  const defaultPassword = process.env.DEFAULT_PASSWORD || 'admin123';
  
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);
  
  users.push({
    id: 1,
    username: defaultUsername,
    password: hashedPassword
  });
  
  console.log(`Default user initialized: ${defaultUsername}`);
})();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: { message: 'Username and password are required', status: 400 }
      });
    }

    const user = users.find(u => u.username === username);
    
    if (!user) {
      return res.status(401).json({
        error: { message: 'Invalid credentials', status: 401 }
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({
        error: { message: 'Invalid credentials', status: 401 }
      });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: { message: 'Internal server error', status: 500 }
    });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: { message: 'Username and password are required', status: 400 }
      });
    }

    const existingUser = users.find(u => u.username === username);
    if (existingUser) {
      return res.status(409).json({
        error: { message: 'Username already exists', status: 409 }
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      id: users.length + 1,
      username,
      password: hashedPassword
    };

    users.push(newUser);

    const token = jwt.sign(
      { id: newUser.id, username: newUser.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: newUser.id,
        username: newUser.username
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: { message: 'Internal server error', status: 500 }
    });
  }
});

router.get('/me', require('../middleware/auth').authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username
    }
  });
});

module.exports = router;

