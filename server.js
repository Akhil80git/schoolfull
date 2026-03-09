require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const connectDB = require('./config/database');

const authRoutes    = require('./routes/authRoutes');
const adminRoutes   = require('./routes/adminRoutes');
const studentRoutes = require('./routes/studentRoutes');
const chatRoutes    = require('./routes/chatRoutes');

const socketInit = require('./socket/socketHandler');

const app    = express();
const server = http.createServer(app);

// 1. Database
connectDB();

// 2. Middlewares
app.use(cors({
    origin:      "*",
    methods:     ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));

// Google Firebase popup ke liye COOP/COEP headers
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy',   'same-origin-allow-popups');
    res.setHeader('Cross-Origin-Embedder-Policy',  'unsafe-none');
    next();
});

app.use(express.json());
app.use(express.static('public'));

// 3. Socket init
const io = socketInit(server);
app.set('socketio', io);

// 4. Routes
app.use('/api/auth',    authRoutes);
app.use('/api/admin',   adminRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/chat',    chatRoutes);

app.get('/', (req, res) => {
    res.json({
        status:  "Active",
        message: "🚀 School Communication API is Running Successfully!"
    });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`
    ===========================================
    ✅ MongoDB Connected Successfully
    🚀 Server running on http://localhost:${PORT}
    📡 Socket.io is Live and Ready
    ===========================================
    `);
});