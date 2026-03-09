const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const spamFilter = require('../middleware/spamFilter');
const {
    sendPrivateMessage,
    getPrivateHistory,
    getInbox,
    sendGroupMessage,
    getGroupHistory,
    adminGetStudents,
    adminGetPrivateChat,
    adminGetGroupChat,
    adminSendGroupMessage,
    adminGetAnalytics
} = require('../controllers/chatController');

// ===== STUDENT ROUTES =====
router.post('/private/send',              auth, spamFilter, sendPrivateMessage);
router.get('/private/history/:otherStudentId', auth, getPrivateHistory);
router.get('/inbox',                      auth, getInbox);          // ← NEW
router.post('/group/send',                auth, spamFilter, sendGroupMessage);
router.get('/group/history',              auth, getGroupHistory);

// ===== ADMIN ROUTES =====
router.get('/admin/students',             auth, adminGetStudents);
router.get('/admin/private/:studentId1/:studentId2', auth, adminGetPrivateChat);
router.get('/admin/group/:className',     auth, adminGetGroupChat);
router.post('/admin/group/send',          auth, adminSendGroupMessage);
router.get('/admin/analytics',            auth, adminGetAnalytics);

module.exports = router;