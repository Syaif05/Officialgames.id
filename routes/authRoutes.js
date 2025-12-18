// routes/authRoutes.js
const express = require('express');
const passport = require('passport');
const router = express.Router();

// 1. Tombol Login (Mengarahkan ke Google)
router.get('/google', passport.authenticate('google', { 
    scope: ['profile', 'email', 'https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.activity.readonly', 'https://www.googleapis.com/auth/admin.directory.group', 'https://www.googleapis.com/auth/directory.readonly'],
    accessType: 'offline', // Penting untuk dapat Refresh Token
    prompt: 'consent'      // Memaksa user setuju agar dapat token penuh
}));

// 2. Callback dari Google (Setelah user pilih akun)
router.get('/google/callback', 
    passport.authenticate('google', { 
        failureRedirect: '/auth/login-failed',
        failureFlash: true 
    }),
    (req, res) => {
        // SUKSES LOGIN
        console.log('Login Berhasil:', req.user.name);
        res.redirect('/admin/dashboard');
    }
);

// 3. Halaman Gagal Login
router.get('/login-failed', (req, res) => {
    res.send('Login Gagal. Pastikan email Anda terdaftar di WHITELIST ADMIN (.env). <a href="/auth/google">Coba Lagi</a>');
});

// 4. Logout
router.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        req.session.destroy(() => {
            res.redirect('/');
        });
    });
});

module.exports = router;