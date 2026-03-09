const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    senderStudentId:   { type: String,  required: true },
    senderName:        { type: String,  required: true },
    receiverStudentId: { type: String,  default: null  },
    className:         { type: String,  default: null  },
    schoolName:        { type: String,  default: null  },
    isGroup:           { type: Boolean, default: false },
    text:              { type: String,  required: true },

    // ── Delivery / Seen status ──
    isDelivered:  { type: Boolean, default: false },   // receiver online tha jab message aaya
    deliveredAt:  { type: Date,    default: null  },
    isRead:       { type: Boolean, default: false },   // receiver ne chat khola
    seenAt:       { type: Date,    default: null  },

    isBlocked:    { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Message', MessageSchema);