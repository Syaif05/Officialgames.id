const mongoose = require('mongoose');

const SettingSchema = new mongoose.Schema({
    logoUrl: { type: String, default: '' },
    shopeeUrl: { type: String, default: '#' },
    lynkUrl: { type: String, default: '#' },
    waNumber: { type: String, default: '' },
    heroTitle: { type: String, default: 'Solusi Digital Tanpa Batas' },
    heroSubtitle: { type: String, default: 'Akses ribuan file game, film, dan software premium.' },
    // TAMBAHAN BARU:
    memberFolderId: { type: String, default: '' } 
});

module.exports = mongoose.model('Setting', SettingSchema);