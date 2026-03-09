const Admin = require('../models/Admin');
const Student = require('../models/Student');
const { encrypt } = require('../utils/encryptionHelper');
const { generateStudentQR } = require('../utils/qrHelper');
const crypto = require('crypto');

exports.registerStudent = async (req, res) => {
    try {
        const { username, className, schoolName } = req.body;
        const adminId = req.user.id; // Auth middleware se milega

        // Admin ka school fix karo agar pehle se "Pending" hai
        await Admin.findByIdAndUpdate(adminId, { schoolName: schoolName });

        const studentId = `STU-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const secureToken = crypto.randomBytes(32).toString('hex');

        const newStudent = await Student.create({
            username,
            studentId,
            studentIdEncrypted: encrypt(studentId),
            schoolName: schoolName,
            className,
            secureToken,
            isOnline: false
        });

        const qrData = { username, studentId, schoolName, className, token: secureToken };
        const qrCode = await generateStudentQR(qrData);

        res.status(201).json({ success: true, qrCode, student: newStudent });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};