const path = require('path');
// 1. LOAD ENV & CORE MODULES
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const methodOverride = require('method-override');
const flash = require('connect-flash');
const connectDB = require('./config/database');

// Import Model Setting (PENTING AGAR TIDAK ERROR 'site is not defined')
const Setting = require('./models/Setting'); 

// --- 2. KONEKSI DATABASE ---
connectDB();

const app = express();

// --- 3. CONFIG VIEW ENGINE ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// --- 4. MIDDLEWARE DASAR ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

// --- 5. SESSION CONFIG ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'rahasia_super_aman',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false, // Set true jika sudah HTTPS
        maxAge: 24 * 60 * 60 * 1000 
    }
}));

// --- 6. PASSPORT INIT ---
require('./config/passport')(passport); 

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// --- 7. GLOBAL VARIABLES (PERBAIKAN UTAMA DI SINI) ---
app.use(async (req, res, next) => {
    try {
        // Ambil Pengaturan Global (Agar navbar tidak error)
        const settings = await Setting.findOne();
        
        // Simpan ke locals agar bisa diakses di SEMUA file EJS (navbar, footer, home)
        res.locals.site = settings || {
            siteTitle: 'Officialgames.id',
            siteDescription: 'Pusat Database',
            logoUrl: '', // Default kosong biar gak error
            contactWa: '',
            shopeeLink: '',
            lynkidLink: ''
        };

        // Data User & Flash Message
        res.locals.user = req.user || null;
        res.locals.error = req.flash('error');
        res.locals.success = req.flash('success');
        res.locals.currentPath = req.path;
        
        next();
    } catch (error) {
        console.error("Gagal memuat settings:", error);
        next();
    }
});

// --- 8. ROUTES ---
app.use('/', require('./routes/publicRoutes'));
app.use('/auth', require('./routes/authRoutes'));
app.use('/admin', require('./routes/adminRoutes'));

// --- 9. START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// TAMBAHKAN BARIS INI JIKA BELUM ADA:
module.exports = app;