const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Student = require('../models/Student');

// Apna data lo — auto login ke liye
router.get('/me', auth, async (req, res) => {
    try {
        const student = await Student.findById(req.user.id)
            .select('username studentId className schoolName isOnline lastSeen');
        if (!student) return res.status(404).json({ success: false, message: "Student not found" });
        res.json({ success: true, student });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Classmate list with Online Status
router.get('/classmates', auth, async (req, res) => {
    try {
        const currentStudent = await Student.findById(req.user.id);
        if (!currentStudent) return res.status(404).json({ message: "Student not found" });

        const classmates = await Student.find({ 
            schoolName: currentStudent.schoolName, 
            className: currentStudent.className 
        }).select('username studentId isOnline lastSeen'); 

        res.json(classmates);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;