const Student = require('../models/Student');
const Message = require('../models/Message');
const { Server } = require('socket.io');

function getPrivateRoomId(id1, id2) {
    return [id1, id2].sort().join('_');
}

// studentId → socketId mapping
const studentSockets = {};

// Export as function (backward compat with server.js)
// studentSockets is attached as property for chatController
const socketInit = (server) => {
    const io = new Server(server, {
        cors: { origin: "*", methods: ["GET", "POST"] }
    });

    // Server start pe sab offline
    Student.updateMany({}, { isOnline: false }).then(() => {
        console.log("✅ All students marked offline on server start");
    });

    io.on('connection', (socket) => {
        let currentStudentId = null;
        let currentClassName = null;

        // ── JOIN CLASS ──
        socket.on('join-class', async (data) => {
            currentStudentId = data.studentId;
            currentClassName = data.className;

            studentSockets[currentStudentId] = socket.id;
            socket.data.studentId = currentStudentId;  // direct emit ke liye
            socket.join(currentClassName);

            await Student.findOneAndUpdate(
                { studentId: currentStudentId },
                { isOnline: true }
            );

            // Receiver online aaya — uske liye pending messages mark delivered
            const now = new Date();
            const pendingMsgs = await Message.updateMany(
                { receiverStudentId: currentStudentId, isDelivered: false },
                { isDelivered: true, deliveredAt: now }
            );

            // Senders ko notify karo ki unka message deliver ho gaya
            if (pendingMsgs.modifiedCount > 0) {
                // Find unique senders of those messages
                const undeliveredMsgs = await Message.find(
                    { receiverStudentId: currentStudentId, isDelivered: true, deliveredAt: now }
                ).select('_id senderStudentId');

                const senderIds = [...new Set(undeliveredMsgs.map(m => m.senderStudentId))];
                senderIds.forEach(senderId => {
                    const msgs = undeliveredMsgs.filter(m => m.senderStudentId === senderId);
                    io.sockets.sockets.forEach((sock) => {
                        if (sock.data && sock.data.studentId === senderId) {
                            msgs.forEach(m => {
                                sock.emit('msg-delivered', { msgId: m._id, deliveredAt: now });
                            });
                        }
                    });
                });
            }

            io.to(currentClassName).emit('status-update', {
                studentId: currentStudentId,
                isOnline:  true
            });

            // Naye user ko baaki sab ka current status bhejo
            try {
                const classmates = await Student.find({
                    className: currentClassName,
                    studentId: { $ne: currentStudentId }
                }).select('studentId isOnline lastSeen');

                classmates.forEach(c => {
                    socket.emit('status-update', {
                        studentId: c.studentId,
                        isOnline:  c.isOnline,
                        lastSeen:  c.lastSeen
                    });
                });
            } catch(e) {
                console.error("status sync error:", e.message);
            }

            console.log(`✅ ${currentStudentId} joined class: ${currentClassName}`);
        });

        // ── JOIN PRIVATE ROOM ──
        socket.on('join-private', (data) => {
            const roomId = getPrivateRoomId(data.myStudentId, data.otherStudentId);
            socket.join(roomId);
            console.log(`🔒 ${data.myStudentId} joined private room: ${roomId}`);
        });

        // ── MARK SEEN (socket se bhi aa sakta hai) ──
        socket.on('mark-seen', async (data) => {
            try {
                const now = new Date();
                const updated = await Message.updateMany(
                    {
                        senderStudentId:   data.otherStudentId,
                        receiverStudentId: data.myStudentId,
                        isRead:            false
                    },
                    { isRead: true, seenAt: now }
                );

                if (updated.modifiedCount > 0) {
                    const payload = {
                        byStudentId:    data.myStudentId,
                        otherStudentId: data.otherStudentId,  // sender jo "Seen" dekhega
                        seenAt:         now
                    };

                    // Room mein emit
                    const roomId = getPrivateRoomId(data.myStudentId, data.otherStudentId);
                    io.to(roomId).emit('msgs-seen', payload);

                    // Direct: sender ke SABHI sockets pe emit (socket.data.studentId se match)
                    io.sockets.sockets.forEach((sock) => {
                        if (sock.data && sock.data.studentId === data.otherStudentId) {
                            sock.emit('msgs-seen', payload);
                        }
                    });

                    console.log(`👁 ${data.myStudentId} saw ${updated.modifiedCount} msgs from ${data.otherStudentId}`);
                }
            } catch(err) {
                console.error("mark-seen error:", err.message);
            }
        });

        // ── DISCONNECT ──
        socket.on('disconnect', async () => {
            if (currentStudentId) {
                delete studentSockets[currentStudentId];
                try {
                    const now = new Date();
                    await Student.findOneAndUpdate(
                        { studentId: currentStudentId },
                        { isOnline: false, lastSeen: now }
                    );
                    io.to(currentClassName).emit('status-update', {
                        studentId: currentStudentId,
                        isOnline:  false,
                        lastSeen:  now
                    });
                    console.log(`❌ ${currentStudentId} disconnected`);
                } catch(err) {
                    console.error("Disconnect error:", err.message);
                }
            }
        });

        // ── LEGACY: send-msg (group ke liye) ──
        socket.on('send-msg', (data) => {
            io.to(data.className).emit('new-group-msg', data);
        });

        // ── FORCE LOGOUT check on join ──
        // Agar admin ne QR refresh kiya ho to join-class pe hi force-logout bhejo
        socket.on('check-force-logout', async (data) => {
            try {
                const Student = require('../models/Student');
                const s = await Student.findOne({ studentId: data.studentId });
                if (s && s.forceLogout) {
                    socket.emit('force-logout', { reason: 'QR refreshed by admin. Naya QR lo.' });
                }
            } catch(e) {}
        });
    });

    return io;
};

socketInit.studentSockets = studentSockets;
module.exports = socketInit;