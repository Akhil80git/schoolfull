const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const Student  = require('../models/Student');
const Admin    = require('../models/Admin');

const ACCESS_SECRET  = process.env.JWT_SECRET        || 'access_secret_key';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh_secret_key';
const QR_SECRET      = process.env.QR_SECRET          || 'qr_hmac_secret_key';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAccessToken(payload) {
    return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '5m' });
}

function makeRefreshToken(payload) {
    return jwt.sign(payload, REFRESH_SECRET, { expiresIn: '30d' });
}

// HMAC signature banao (QR ke liye)
function makeSignature(data) {
    return crypto.createHmac('sha256', QR_SECRET).update(JSON.stringify(data)).digest('hex');
}

// loginToken hash (DB mein plain nahi rakhte)
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// Device fingerprint — IP + userAgent se
function deviceFingerprint(req) {
    const ip        = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    return crypto.createHash('sha256').update(ip + '|' + userAgent).digest('hex');
}

function getDeviceInfo(req) {
    return {
        ip:        req.ip || req.headers['x-forwarded-for'] || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        platform:  req.headers['sec-ch-ua-platform'] || 'unknown',
    };
}

// ─── ADMIN: Student banao + QR data generate karo ────────────────────────────

exports.adminCreateStudent = async (req, res) => {
    try {
        const { username, className } = req.body;
        const admin = await Admin.findById(req.user.id);
        if (!admin) return res.status(403).json({ success: false, message: "Admin not found" });

        // Unique studentId
        const studentId = 'STU-' + crypto.randomBytes(3).toString('hex').toUpperCase();

        // One-time login token (plain — QR mein jayega, hash DB mein)
        const plainLoginToken = crypto.randomBytes(32).toString('hex');
        const hashedToken     = hashToken(plainLoginToken);

        // Hashed studentId for QR (security ke liye)
        const hashedStudentId = crypto.createHmac('sha256', QR_SECRET).update(studentId).digest('hex').slice(0, 16);

        // QR payload
        const qrPayload = {
            studentId:   hashedStudentId,  // hashed — real ID expose nahi hoti
            loginToken:  plainLoginToken,  // one-time
        };
        // Signature add karo
        qrPayload.signature = makeSignature({ studentId: hashedStudentId, loginToken: plainLoginToken });

        const student = await Student.create({
            username,
            studentId,
            className,
            schoolName:       admin.schoolName,
            loginToken:       hashedToken,
            loginTokenUsed:   false,
            qrGeneratedAt:    new Date(),
        });

        res.json({
            success: true,
            student: {
                _id:       student._id,
                username:  student.username,
                studentId: student.studentId,
                className: student.className,
            },
            qrData: JSON.stringify(qrPayload)   // yeh QR mein encode karo
        });
    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─── ADMIN: Student ka QR refresh karo ────────────────────────────────────

exports.adminRefreshStudentQR = async (req, res) => {
    try {
        const { studentId } = req.params;
        const admin = await Admin.findById(req.user.id);
        if (!admin) return res.status(403).json({ success: false, message: "Admin not found" });

        const student = await Student.findOne({ studentId, schoolName: admin.schoolName });
        if (!student) return res.status(404).json({ success: false, message: "Student not found" });

        // Naya one-time token
        const plainLoginToken = crypto.randomBytes(32).toString('hex');
        const hashedToken     = hashToken(plainLoginToken);
        const hashedStudentId = crypto.createHmac('sha256', QR_SECRET).update(studentId).digest('hex').slice(0, 16);

        const qrPayload = {
            studentId:  hashedStudentId,
            loginToken: plainLoginToken,
        };
        qrPayload.signature = makeSignature({ studentId: hashedStudentId, loginToken: plainLoginToken });

        // Force logout + device reset + new token
        await Student.findOneAndUpdate({ studentId }, {
            loginToken:        hashedToken,
            loginTokenUsed:    false,
            qrGeneratedAt:     new Date(),
            qrRefreshedAt:     new Date(),
            qrRefreshedBy:     admin._id.toString(),
            forceLogout:       true,           // socket se auto-logout
            deviceFingerprint: null,           // device lock reset
            refreshToken:      null,
            refreshTokenExpiresAt: null,
        });

        // Socket se student ko force-logout karo
        const io = req.app.get('socketio');
        if (io) {
            io.sockets.sockets.forEach((sock) => {
                if (sock.data && sock.data.studentId === studentId) {
                    sock.emit('force-logout', { reason: 'QR refreshed by admin' });
                }
            });
        }

        res.json({
            success: true,
            message: `${student.username} ka QR refresh ho gaya, auto-logout hua`,
            qrData:  JSON.stringify(qrPayload)
        });
    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─── STUDENT: QR Login ─────────────────────────────────────────────────────

exports.studentQRLogin = async (req, res) => {
    try {
        const { studentId: hashedStudentIdFromQR, loginToken, signature } = req.body;
        const fingerprint = deviceFingerprint(req);
        const devInfo     = getDeviceInfo(req);

        // 1. Signature verify karo
        const expectedSig = makeSignature({ studentId: hashedStudentIdFromQR, loginToken });
        if (signature !== expectedSig) {
            return res.status(401).json({ success: false, message: "Invalid QR — signature mismatch" });
        }

        // 2. hashedStudentId se student dhundo
        //    Har student ka hash compute karo (ya DB mein store karo — yahan compute karte hain)
        const allStudents = await Student.find({});
        let student = null;
        for (const s of allStudents) {
            const h = require('crypto').createHmac('sha256', QR_SECRET).update(s.studentId).digest('hex').slice(0, 16);
            if (h === hashedStudentIdFromQR) { student = s; break; }
        }
        if (!student) return res.status(404).json({ success: false, message: "Student not found" });

        // 3. loginToken verify (hash check)
        const hashedProvided = hashToken(loginToken);
        if (student.loginToken !== hashedProvided) {
            return res.status(401).json({ success: false, message: "Invalid or expired QR token" });
        }

        // ── CASE A: QR pehli baar use ho raha hai ──────────────────────────
        if (!student.loginTokenUsed) {
            // Mark token as used, device lock karo
            const now = new Date();
            const accessToken  = makeAccessToken({ id: student._id, role: 'student' });
            const refreshToken = makeRefreshToken({ id: student._id, role: 'student' });

            await Student.findByIdAndUpdate(student._id, {
                loginTokenUsed:        true,
                loginTokenUsedAt:      now,
                deviceFingerprint:     fingerprint,
                deviceInfo: {
                    ...devInfo,
                    firstSeen: now,
                    lastSeen:  now,
                },
                refreshToken:          hashToken(refreshToken),
                refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                forceLogout:           false,
            });

            return res.json({
                success:      true,
                accessToken,
                refreshToken,
                student: {
                    studentId:  student.studentId,
                    username:   student.username,
                    className:  student.className,
                    schoolName: student.schoolName,
                }
            });
        }

        // ── CASE B: QR already used ────────────────────────────────────────
        // Same device se aa raha hai?
        if (student.deviceFingerprint !== fingerprint) {
            return res.status(403).json({
                success: false,
                message: "Yeh QR already use ho chuka hai aur alag device se nahi khula ja sakta"
            });
        }

        // Same device — username poochho (re-login flow)
        return res.json({
            success:       false,
            needsVerify:   true,
            message:       "QR already used. Apna username enter karo re-login ke liye",
            deviceMatched: true
        });

    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─── STUDENT: Re-login (same device, username verify) ─────────────────────

exports.studentReLogin = async (req, res) => {
    try {
        const { studentId: hashedStudentId, loginToken, username } = req.body;
        const fingerprint = deviceFingerprint(req);
        const devInfo     = getDeviceInfo(req);

        // Signature skip — already device matched in QR login step
        // Find student
        const allStudents = await Student.find({});
        let student = null;
        for (const s of allStudents) {
            const h = require('crypto').createHmac('sha256', QR_SECRET).update(s.studentId).digest('hex').slice(0, 16);
            if (h === hashedStudentId) { student = s; break; }
        }
        if (!student) return res.status(404).json({ success: false, message: "Student not found" });

        // Token verify
        if (student.loginToken !== hashToken(loginToken)) {
            return res.status(401).json({ success: false, message: "Invalid QR token" });
        }

        // Device verify
        if (student.deviceFingerprint !== fingerprint) {
            return res.status(403).json({ success: false, message: "Wrong device" });
        }

        // Username verify
        if (student.username.toLowerCase() !== username.trim().toLowerCase()) {
            return res.status(401).json({ success: false, message: "Galat username" });
        }

        // Issue new tokens
        const now          = new Date();
        const accessToken  = makeAccessToken({ id: student._id, role: 'student' });
        const refreshToken = makeRefreshToken({ id: student._id, role: 'student' });

        await Student.findByIdAndUpdate(student._id, {
            refreshToken:          hashToken(refreshToken),
            refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            forceLogout:           false,
            'deviceInfo.lastSeen': now,
        });

        res.json({
            success:      true,
            accessToken,
            refreshToken,
            student: {
                studentId:  student.studentId,
                username:   student.username,
                className:  student.className,
                schoolName: student.schoolName,
            }
        });
    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─── STUDENT: Refresh Access Token ────────────────────────────────────────

exports.studentRefreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ success: false, message: "No refresh token" });

        // Verify JWT
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, REFRESH_SECRET);
        } catch(e) {
            return res.status(401).json({ success: false, message: "Invalid or expired refresh token" });
        }

        const student = await Student.findById(decoded.id);
        if (!student) return res.status(404).json({ success: false, message: "Student not found" });

        // DB mein hash se match karo
        if (student.refreshToken !== hashToken(refreshToken)) {
            return res.status(401).json({ success: false, message: "Refresh token mismatch" });
        }

        // Expiry check
        if (student.refreshTokenExpiresAt < new Date()) {
            return res.status(401).json({ success: false, message: "Refresh token expired" });
        }

        // Force logout check
        if (student.forceLogout) {
            return res.status(403).json({ success: false, message: "Admin ne logout kiya hai. Naya QR lo." });
        }

        // New access token
        const newAccessToken = makeAccessToken({ id: student._id, role: 'student' });

        res.json({ success: true, accessToken: newAccessToken });
    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─── ADMIN: QR usage stats ─────────────────────────────────────────────────

exports.adminGetQRStats = async (req, res) => {
    try {
        const admin    = await Admin.findById(req.user.id);
        if (!admin) return res.status(403).json({ success: false, message: "Admin not found" });

        const students = await Student.find({ schoolName: admin.schoolName })
            .select('username studentId className loginTokenUsed loginTokenUsedAt deviceInfo qrGeneratedAt qrRefreshedAt forceLogout isOnline');

        const stats = students.map(s => ({
            username:        s.username,
            studentId:       s.studentId,
            className:       s.className,
            isOnline:        s.isOnline,
            qrStatus:        s.loginTokenUsed ? 'Used' : 'Not Used',
            qrUsedAt:        s.loginTokenUsedAt,
            qrGeneratedAt:   s.qrGeneratedAt,
            qrRefreshedAt:   s.qrRefreshedAt,
            forceLogout:     s.forceLogout,
            deviceInfo:      s.deviceInfo,
        }));

        res.json({ success: true, stats });
    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─── ADMIN: Google Firebase Login ─────────────────────────────────────────

exports.adminGoogleLogin = async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) return res.status(400).json({ success: false, message: "idToken required" });

        // Firebase Admin SDK se verify karo
        let decodedToken;
        try {
            const admin_app = require('../config/firebaseAdmin'); // firebase-admin initialized
            decodedToken = await admin_app.auth().verifyIdToken(idToken);
        } catch(e) {
            return res.status(401).json({ success: false, message: "Invalid Firebase token: " + e.message });
        }

        const { email, name, uid } = decodedToken;

        // Admin DB mein dhundo ya pehli baar auto-create karo
        let admin = await Admin.findOne({ email });
        if (!admin) {
            // Pehli baar — admin create karo (schoolName baad mein set hoga)
            admin = await Admin.create({
                email,
                displayName: name || email,
                firebaseUid: uid,
                schoolName:  'Pending',   // admin baad mein set karega
                password:    'firebase',  // placeholder
            });
        } else {
            // uid update karo agar nahi hai
            if (!admin.firebaseUid) {
                await Admin.findByIdAndUpdate(admin._id, { firebaseUid: uid, displayName: name });
                admin.firebaseUid = uid;
            }
        }

        const token = makeAccessToken({ id: admin._id, role: 'admin' });
        res.json({
            success: true,
            token,
            admin: {
                id:          admin._id,
                email:       admin.email,
                displayName: admin.displayName || name,
                schoolName:  admin.schoolName,
            }
        });
    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─── ADMIN: Email/Password Login (fallback) ────────────────────────────────

exports.adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        const admin = await Admin.findOne({ email });
        if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });

        const bcrypt  = require('bcryptjs');
        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) return res.status(401).json({ success: false, message: "Wrong password" });

        const token = makeAccessToken({ id: admin._id, role: 'admin' });
        res.json({ success: true, token, admin: { id: admin._id, email: admin.email, schoolName: admin.schoolName } });
    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
};