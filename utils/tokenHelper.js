const jwt = require('jsonwebtoken');

// Access token — 7 din (pehle 15 min tha — bahut kam tha)
exports.generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// Refresh token — 30 din
exports.generateRefreshToken = (id) => {
    return jwt.sign({ id }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '30d' });
};