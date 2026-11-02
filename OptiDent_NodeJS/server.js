import express from 'express';
import session from 'express-session';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { connectDB } from './api/config/db.js';
import normalizePhp from './api/middleware/normalizePhp.js';

import authRoutes from './api/auth/index.js';
import clientRoutes from './api/client/index.js';
import receptionistRoutes from './api/receptionist/index.js';
import doctorRoutes from './api/doctor/index.js';
import adminRoutes from './api/admin/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Trust cloud reverse proxies (Render, Railway, Cloudflare)
app.set('trust proxy', 1);

// Connect to MongoDB
await connectDB();

// Core Middleware
app.use(cors({
    origin: true,
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'optident_session_secret_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Normalize .php requests transparently
app.use(normalizePhp);

// Serve Frontend Static Assets
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.use('/assets', express.static(path.join(publicDir, 'assets')));
app.use('/css', express.static(path.join(publicDir, 'css')));

// API Routes Modules
app.use('/api/auth', authRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/receptionist', receptionistRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        server: 'Node.js Express',
        database: 'MongoDB',
        timestamp: new Date().toISOString()
    });
});

// JSON fallback for any unhandled /api/* requests to avoid returning 404 HTML
app.use('/api', (req, res) => {
    res.status(404).json({
        status: 'error',
        message: `API endpoint ${req.method} ${req.originalUrl} not found.`
    });
});

// Root default route
app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('[Server Error]', err.stack);
    res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred.'
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 OptiDent Node.js Server running on: http://localhost:${PORT}`);
    console.log(`📁 Pure JavaScript Modular Stack + MongoDB`);
    console.log(`🎨 UI/UX: 100% Identical Design & Interactive Controls`);
    console.log(`====================================================`);
});

