const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const {
    adminGoogleLogin,
    adminCreateStudent,
    adminRefreshStudentQR,
    adminGetQRStats,
    studentQRLogin,
    studentReLogin,
    studentRefreshToken,
} = require('../controllers/authController');

// ── Admin ──────────────────────────────────────────────
router.post('/admin/google',                      adminGoogleLogin);   // Google Firebase login
router.post('/admin/create-student',        auth, adminCreateStudent);
router.post('/admin/refresh-qr/:studentId', auth, adminRefreshStudentQR);
router.get('/admin/qr-stats',               auth, adminGetQRStats);

// ── Student ────────────────────────────────────────────
router.post('/student/qr-login',                  studentQRLogin);
router.post('/student/re-login',                  studentReLogin);
router.post('/student/refresh',                   studentRefreshToken);

module.exports = router;