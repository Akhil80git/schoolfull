const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
    // Basic Info
    username:    { type: String, required: true },
    studentId:   { type: String, required: true, unique: true },
    className:   { type: String, required: true },
    schoolName:  { type: String, required: true },

    // QR Security
    loginToken:       { type: String, default: null },   // one-time QR token (hashed in DB)
    loginTokenUsed:   { type: Boolean, default: false }, // QR use hua ya nahi
    loginTokenUsedAt: { type: Date,    default: null  },
    qrGeneratedAt:    { type: Date,    default: null  },

    // Device Lock — sirf ek device allowed
    deviceFingerprint: { type: String, default: null }, // device ka unique hash
    deviceInfo: {                                        // admin ke liye info
        ip:        { type: String, default: null },
        userAgent: { type: String, default: null },
        platform:  { type: String, default: null },
        firstSeen: { type: Date,   default: null },
        lastSeen:  { type: Date,   default: null }
    },

    // Refresh Token (DB mein save — 30 days)
    refreshToken:          { type: String, default: null },
    refreshTokenExpiresAt: { type: Date,   default: null },

    // Online status
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date,    default: null  },

    // Admin QR refresh track
    qrRefreshedAt:     { type: Date,    default: null  },
    qrRefreshedBy:     { type: String,  default: null  }, // admin id
    forceLogout:       { type: Boolean, default: false }, // admin ne force logout kiya

}, { timestamps: true });

module.exports = mongoose.model('Student', StudentSchema);