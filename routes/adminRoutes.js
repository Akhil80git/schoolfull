const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const auth = require('../middleware/auth'); // Admin token verify karne ke liye

// Frontend ki fetch URL ke mutabik:
router.post('/register', auth, adminController.registerStudent);

module.exports = router;