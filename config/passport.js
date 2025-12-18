const GoogleStrategy = require('passport-google-oauth20').Strategy;

// HAPUS require('dotenv').config() DARI SINI
// Kita mengandalkan server.js yang sudah memuatnya secara global

const configurePassport = function (passport) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            const emailFromGoogle = profile.emails[0].value.toLowerCase().trim();
            
            // Debugging Extra
            console.log(`[PASSPORT CHECK] Google Email: ${emailFromGoogle}`);

            // Ambil dari process.env global
            const adminEmailsRaw = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : [];
            const allowedEmails = adminEmailsRaw.map(e => e.trim().toLowerCase());

            console.log(`[PASSPORT CHECK] Whitelist: ${JSON.stringify(allowedEmails)}`);

            if (allowedEmails.includes(emailFromGoogle)) {
                const user = {
                    googleId: profile.id,
                    name: profile.displayName,
                    email: emailFromGoogle,
                    photo: profile.photos ? profile.photos[0].value : null,
                    accessToken
                };
                return done(null, user);
            } else {
                return done(null, false, { message: 'Email tidak terdaftar sebagai Admin.' });
            }
        } catch (err) {
            return done(err);
        }
    }));

    passport.serializeUser((user, done) => {
        done(null, user);
    });

    passport.deserializeUser((user, done) => {
        done(null, user);
    });
};

configurePassport.ensureAuth = function (req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/auth/google');
};

module.exports = configurePassport;