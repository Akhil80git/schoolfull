require('dotenv').config();
const express  = require('express');
const http     = require('http');
const cors     = require('cors');
const connectDB     = require('./config/database');
const authRoutes    = require('./routes/authRoutes');
const adminRoutes   = require('./routes/adminRoutes');
const studentRoutes = require('./routes/studentRoutes');
const chatRoutes    = require('./routes/chatRoutes');
const socketInit    = require('./socket/socketHandler');

const app    = express();
const server = http.createServer(app);

// ===============================
// 1. Connect Database
// ===============================
connectDB();

// ===============================
// 2. CORS Configuration
// Frontend: Firebase Hosting pe hai
// Backend:  Render pe hai
// ===============================
const allowedOrigins = [
    'http://localhost:5000',
    'http://localhost:3000',
    'http://127.0.0.1:5000',
    'https://schoolmassge.web.app',         // Firebase Hosting (main)
    'https://schoolmassge.firebaseapp.com', // Firebase Hosting (alternate)
    process.env.CLIENT_URL,                 // Render env se (optional extra)
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (Postman, mobile apps, curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        console.warn('CORS blocked:', origin);
        callback(new Error('CORS blocked: ' + origin));
    },
    methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials:    true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// ===============================
// 3. Security Headers
// Firebase Google login ke liye
// ===============================
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy',  'same-origin-allow-popups');
    res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
    next();
});

// ===============================
// 4. Body Parser
// ===============================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===============================
// 5. Socket.IO Init
// ===============================
const io = socketInit(server);
app.set('socketio', io);

// ===============================
// 6. API Routes
// ===============================
app.use('/api/auth',    authRoutes);
app.use('/api/admin',   adminRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/chat',    chatRoutes);

// ===============================
// 7. Health Check
// ===============================
app.get('/', (req, res) => {
    res.json({
        status:  'Active',
        message: '🚀 School Communication API is Running!',
        time:    new Date().toISOString()
    });
});

// ===============================
// 8. Global Error Handler
// ===============================
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err.stack);
    res.status(500).json({
        success: false,
        message: 'Something went wrong!',
        error:   process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ===============================
// 9. Start Server
// ===============================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`
===========================================
✅ MongoDB Connected Successfully
🚀 Server running on port ${PORT}
📡 Socket.io is Live and Ready
🌍 Environment: ${process.env.NODE_ENV || 'development'}
🔗 Frontend: Firebase Hosting (schoolmassge.web.app)
===========================================
    `);
});
