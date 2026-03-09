const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
    name: { type: String, required: true }, // e.g., "Class 4"
    schoolName: { type: String, required: true },
    classId: { type: String, required: true, unique: true },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }]
}, { timestamps: true });

module.exports = mongoose.model('Group', GroupSchema);