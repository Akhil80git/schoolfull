const mongoose = require('mongoose');

const AdminSchema = new mongoose.Schema({
    email:       { type: String, required: true, unique: true },
    password:    { type: String, default: 'firebase' },
    displayName: { type: String, default: '' },
    firebaseUid: { type: String, default: null },  // Google UID
    schoolName:  { type: String, default: 'Pending' },
}, { timestamps: true });

module.exports = mongoose.model('Admin', AdminSchema);