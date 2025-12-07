const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  if (process.env.DEV_MODE === 'true') {
    // Mock user for development
    req.user = {
      id: 999,
      username: 'dev_user',
      isDev: true
    };
    console.log('Dev mode: Authentication bypassed for user dev_user');
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: { message: 'Access token required', status: 401 } });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: { message: 'Invalid or expired token', status: 403 } });
    }
    req.user = user;
    next();
  });
};

module.exports = {
  authenticateToken
};
