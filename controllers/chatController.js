const Message = require('../models/Message');
const Student  = require('../models/Student');
const { encrypt, decrypt } = require('../utils/encryptionHelper');

function getPrivateRoomId(id1, id2) {
    return [id1, id2].sort().join('_');
}

// ================================
// PRIVATE: Message bhejo
// ================================
exports.sendPrivateMessage = async (req, res) => {
    try {
        const { receiverStudentId, text } = req.body;
        const sender = await Student.findById(req.user.id);
        if (!sender) return res.status(404).json({ success: false, message: "Sender not found" });

        const receiver = await Student.findOne({ studentId: receiverStudentId });
        if (!receiver) return res.status(404).json({ success: false, message: "Receiver not found" });

        if (receiver.schoolName !== sender.schoolName || receiver.className !== sender.className) {
            return res.status(403).json({ success: false, message: "Alag class/school ke student ko message nahi kar sakte" });
        }

        // Check if receiver is currently online → mark delivered immediately
        const isReceiverOnline = receiver.isOnline;
        const deliveredAt      = isReceiverOnline ? new Date() : null;

        const encryptedText = encrypt(text);
        const message = await Message.create({
            senderStudentId:  sender.studentId,
            senderName:       sender.username,
            receiverStudentId,
            isGroup:          false,
            text:             encryptedText,
            isDelivered:      isReceiverOnline,
            deliveredAt:      deliveredAt
        });

        const io = req.app.get('socketio');
        if (io) {
            const roomId     = getPrivateRoomId(sender.studentId, receiverStudentId);
            const msgPayload = {
                _id:              message._id,
                senderStudentId:  sender.studentId,
                senderName:       sender.username,
                receiverStudentId,
                text,
                createdAt:        message.createdAt,
                isDelivered:      isReceiverOnline,
                deliveredAt:      deliveredAt,
                isRead:           false,
                seenAt:           null
            };
            io.to(roomId).emit('new-private-msg', msgPayload);

            // Sender ko bhi delivery status bhejo
            if (isReceiverOnline) {
                io.sockets.sockets.forEach((sock) => {
                    if (sock.data && sock.data.studentId === sender.studentId) {
                        sock.emit('msg-delivered', {
                            msgId:       message._id,
                            deliveredAt: deliveredAt
                        });
                    }
                });
            }
        }

        res.status(201).json({ success: true, message: "Message sent!" });
    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ================================
// PRIVATE: History lo
// ================================
exports.getPrivateHistory = async (req, res) => {
    try {
        const { otherStudentId } = req.params;
        const me = await Student.findById(req.user.id);
        if (!me) return res.status(404).json({ success: false, message: "Student not found" });

        const messages = await Message.find({
            isGroup: false,
            $or: [
                { senderStudentId: me.studentId,   receiverStudentId: otherStudentId },
                { senderStudentId: otherStudentId, receiverStudentId: me.studentId  }
            ]
        }).sort({ createdAt: 1 }).limit(100);

        const decrypted = messages.map(m => ({
            _id:             m._id,
            senderStudentId: m.senderStudentId,
            senderName:      m.senderName,
            text:            decrypt(m.text),
            isDelivered:     m.isDelivered,
            deliveredAt:     m.deliveredAt,
            isRead:          m.isRead,
            seenAt:          m.seenAt,
            createdAt:       m.createdAt
        }));

        // ── Receiver ne history load ki → mark as seen ──
        const now = new Date();
        const updated = await Message.updateMany(
            { senderStudentId: otherStudentId, receiverStudentId: me.studentId, isRead: false },
            { isRead: true, seenAt: now }
        );

        // Sender ko real-time notify karo
        const io = req.app.get('socketio');
        if (io) {
            const payload = {
                byStudentId:    me.studentId,      // jisne dekha (receiver)
                otherStudentId: otherStudentId,    // sender — woh "Seen" dekhega
                seenAt:         now
            };

            // 1) Room-based emit
            const roomId = getPrivateRoomId(me.studentId, otherStudentId);
            io.to(roomId).emit('msgs-seen', payload);

            // 2) Sender ke SABHI sockets pe directly emit (no import needed)
            //    socketHandler mein socket.data.studentId set karo
            io.sockets.sockets.forEach((sock) => {
                if (sock.data && sock.data.studentId === otherStudentId) {
                    sock.emit('msgs-seen', payload);
                }
            });
        }

        res.status(200).json({ success: true, messages: decrypted });
    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
};


// ================================
// INBOX: Sabhi contacts ka last msg + unread count
// ================================
exports.getInbox = async (req, res) => {
    try {
        const me = await Student.findById(req.user.id);
        if (!me) return res.status(404).json({ success: false, message: "Student not found" });

        // Mere sab messages (sent + received, private only)
        const messages = await Message.find({
            isGroup: false,
            $or: [
                { senderStudentId: me.studentId },
                { receiverStudentId: me.studentId }
            ]
        }).sort({ createdAt: -1 }); // newest first

        // Per-contact: last message + unread count
        const inbox = {};
        messages.forEach(m => {
            const otherId = m.senderStudentId === me.studentId
                ? m.receiverStudentId
                : m.senderStudentId;

            if (!inbox[otherId]) {
                // First (newest) message for this contact
                inbox[otherId] = {
                    lastText:    decrypt(m.text),
                    lastTime:    m.createdAt,
                    isMe:        m.senderStudentId === me.studentId,
                    seen:        m.senderStudentId === me.studentId ? !!m.seenAt : true,
                    delivered:   m.senderStudentId === me.studentId ? !!m.isDelivered : true,
                    unread:      0
                };
            }

            // Count unread (messages sent TO me, not read)
            if (m.receiverStudentId === me.studentId && !m.isRead) {
                inbox[otherId].unread++;
            }
        });

        res.json({ success: true, inbox });
    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ================================
// GROUP: Message bhejo
// ================================
exports.sendGroupMessage = async (req, res) => {
    try {
        const { text } = req.body;
        const sender = await Student.findById(req.user.id);
        if (!sender) return res.status(404).json({ success: false, message: "Sender not found" });

        const encryptedText = encrypt(text);
        const message = await Message.create({
            senderStudentId: sender.studentId,
            senderName:      sender.username,
            className:       sender.className,
            schoolName:      sender.schoolName,
            isGroup:         true,
            text:            encryptedText
        });

        const io = req.app.get('socketio');
        if (io) {
            io.to(sender.className).emit('new-group-msg', {
                _id:             message._id,
                senderStudentId: sender.studentId,
                senderName:      sender.username,
                text,
                createdAt:       message.createdAt
            });
        }

        res.status(201).json({ success: true, message: "Group message sent!" });
    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ================================
// GROUP: History lo
// ================================
exports.getGroupHistory = async (req, res) => {
    try {
        const me = await Student.findById(req.user.id);
        if (!me) return res.status(404).json({ success: false, message: "Student not found" });

        const messages = await Message.find({
            isGroup:    true,
            className:  me.className,
            schoolName: me.schoolName
        }).sort({ createdAt: 1 }).limit(100);

        const decrypted = messages.map(m => ({
            _id:             m._id,
            senderStudentId: m.senderStudentId,
            senderName:      m.senderName,
            text:            decrypt(m.text),
            createdAt:       m.createdAt
        }));

        res.status(200).json({ success: true, messages: decrypted });
    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ================================
// ADMIN: Apne school ke saare students
// ================================
exports.adminGetStudents = async (req, res) => {
    try {
        const Admin = require('../models/Admin');
        const admin = await Admin.findById(req.user.id);
        if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });

        const students = await Student.find({ schoolName: admin.schoolName })
            .select('username studentId className isOnline lastSeen');

        const classes = {};
        students.forEach(s => {
            if (!classes[s.className]) classes[s.className] = [];
            classes[s.className].push(s);
        });

        res.json({ success: true, students, classes });
    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ================================
// ADMIN: 2 students ki private chat
// ================================
exports.adminGetPrivateChat = async (req, res) => {
    try {
        const { studentId1, studentId2 } = req.params;
        const messages = await Message.find({
            isGroup: false,
            $or: [
                { senderStudentId: studentId1, receiverStudentId: studentId2 },
                { senderStudentId: studentId2, receiverStudentId: studentId1 }
            ]
        }).sort({ createdAt: 1 }).limit(200);

        const decrypted = messages.map(m => ({
            _id:              m._id,
            senderStudentId:  m.senderStudentId,
            senderName:       m.senderName,
            receiverStudentId:m.receiverStudentId,
            text:             decrypt(m.text),
            createdAt:        m.createdAt
        }));

        res.json({ success: true, messages: decrypted });
    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ================================
// ADMIN: Class ka group chat
// ================================
exports.adminGetGroupChat = async (req, res) => {
    try {
        const { className } = req.params;
        const Admin = require('../models/Admin');
        const admin = await Admin.findById(req.user.id);

        const messages = await Message.find({
            isGroup:    true,
            className,
            schoolName: admin.schoolName
        }).sort({ createdAt: 1 }).limit(200);

        const decrypted = messages.map(m => ({
            _id:             m._id,
            senderStudentId: m.senderStudentId,
            senderName:      m.senderName,
            text:            decrypt(m.text),
            createdAt:       m.createdAt
        }));

        res.json({ success: true, messages: decrypted });
    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ================================
// ADMIN: Group mein message bhejo
// ================================
exports.adminSendGroupMessage = async (req, res) => {
    try {
        const { className, text } = req.body;
        const Admin = require('../models/Admin');
        const admin = await Admin.findById(req.user.id);
        if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });

        const encryptedText = encrypt(text);
        const message = await Message.create({
            senderStudentId: `ADMIN-${admin._id}`,
            senderName:      `👮 ${admin.displayName || 'Admin'}`,
            className,
            schoolName:      admin.schoolName,
            isGroup:         true,
            text:            encryptedText
        });

        const io = req.app.get('socketio');
        if (io) {
            io.to(className).emit('new-group-msg', {
                _id:             message._id,
                senderStudentId: `ADMIN-${admin._id}`,
                senderName:      `👮 ${admin.displayName || 'Admin'}`,
                text,
                createdAt:       message.createdAt
            });
        }

        res.status(201).json({ success: true, message: "Admin message sent!" });
    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ================================
// ADMIN: Analytics
// ================================
exports.adminGetAnalytics = async (req, res) => {
    try {
        const Admin = require('../models/Admin');
        const admin = await Admin.findById(req.user.id);
        if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });

        const schoolName = admin.schoolName;
        const students   = await Student.find({ schoolName }).select('username studentId className isOnline');

        const studentMap = {};
        students.forEach(s => { studentMap[s.studentId] = { username: s.username, className: s.className, isOnline: s.isOnline }; });

        const allMsgs = await Message.find({
            $or: [
                { schoolName },
                { senderStudentId: { $in: students.map(s => s.studentId) } }
            ]
        }).select('senderStudentId senderName receiverStudentId isGroup className createdAt');

        const sentCount = {}, receivedCount = {};
        students.forEach(s => { sentCount[s.studentId] = 0; receivedCount[s.studentId] = 0; });

        allMsgs.forEach(m => {
            if (sentCount[m.senderStudentId]     !== undefined) sentCount[m.senderStudentId]++;
            if (!m.isGroup && receivedCount[m.receiverStudentId] !== undefined) receivedCount[m.receiverStudentId]++;
        });

        const pairCount = {};
        allMsgs.filter(m => !m.isGroup).forEach(m => {
            const pair = [m.senderStudentId, m.receiverStudentId].sort().join('_');
            pairCount[pair] = (pairCount[pair] || 0) + 1;
        });

        const topPairs = Object.entries(pairCount)
            .sort((a,b) => b[1]-a[1]).slice(0,10)
            .map(([pair, count]) => {
                const [id1, id2] = pair.split('_');
                return { student1: studentMap[id1]?.username||id1, student2: studentMap[id2]?.username||id2, count };
            });

        const groupSenders = {};
        allMsgs.filter(m => m.isGroup).forEach(m => {
            const key = `${m.className}__${m.senderStudentId}`;
            groupSenders[key] = (groupSenders[key]||0)+1;
        });

        const topGroupSenders = Object.entries(groupSenders)
            .sort((a,b) => b[1]-a[1]).slice(0,10)
            .map(([key, count]) => {
                const [className, studentId] = key.split('__');
                return { className, student: studentMap[studentId]?.username||studentId, count };
            });

        const classLeaderboard = {};
        students.forEach(s => {
            if (!classLeaderboard[s.className]) classLeaderboard[s.className] = [];
            classLeaderboard[s.className].push({
                username: s.username, studentId: s.studentId, isOnline: s.isOnline,
                sent:     sentCount[s.studentId]||0,
                received: receivedCount[s.studentId]||0,
                total:    (sentCount[s.studentId]||0)+(receivedCount[s.studentId]||0)
            });
        });

        Object.keys(classLeaderboard).forEach(cls => {
            classLeaderboard[cls].sort((a,b) => b.total-a.total);
            classLeaderboard[cls] = classLeaderboard[cls].map((s,i) => ({
                ...s, rank: i+1,
                grade: getGrade(s.total, classLeaderboard[cls][0]?.total||1)
            }));
        });

        res.json({
            success: true,
            totalStats: {
                totalStudents:  students.length,
                totalMessages:  allMsgs.length,
                totalPrivate:   allMsgs.filter(m=>!m.isGroup).length,
                totalGroup:     allMsgs.filter(m=>m.isGroup).length,
                onlineNow:      students.filter(s=>s.isOnline).length
            },
            topPairs, topGroupSenders, classLeaderboard,
            studentActivity: students.map(s => ({
                username:  s.username, studentId: s.studentId,
                className: s.className, isOnline: s.isOnline,
                sent:      sentCount[s.studentId]||0,
                received:  receivedCount[s.studentId]||0,
                total:     (sentCount[s.studentId]||0)+(receivedCount[s.studentId]||0)
            })).sort((a,b) => b.total-a.total)
        });
    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

function getGrade(score, maxScore) {
    if (maxScore === 0) return { label: 'N/A', color: '#8696a0' };
    const pct = (score/maxScore)*100;
    if (pct >= 80) return { label: 'A+', color: '#25D366' };
    if (pct >= 60) return { label: 'A',  color: '#4CAF50' };
    if (pct >= 40) return { label: 'B',  color: '#2196F3' };
    if (pct >= 20) return { label: 'C',  color: '#FF9800' };
    return           { label: 'D',  color: '#f44336' };
}