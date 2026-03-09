const mongoose = require('mongoose');

const RefreshTokenSchema = new mongoose.Schema({
    token: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    createdAt: { type: Date, default: Date.now, expires: '30d' } // Auto-delete after 30 days
});

module.exports = mongoose.model('RefreshToken', RefreshTokenSchema);