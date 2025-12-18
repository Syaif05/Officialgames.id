const mongoose = require('mongoose');

const MemberSchema = new mongoose.Schema({
    email: { type: String, required: true, index: true }, // Email tetap unik per orang
    name: { type: String },
    role: { type: String, default: 'member' },
    status: { type: String, default: 'active', enum: ['active', 'terpental'] },
    groupName: { type: String, required: true, index: true }, // Grup mana dia berasal
    joinDate: { type: Date },
    lastSync: { type: Date, default: Date.now }
});

// Compound Index: Satu email bisa masuk banyak grup berbeda (opsional, tergantung kebutuhan bisnis)
// Tapi untuk saat ini kita asumsikan 1 email = 1 data member global, tapi kita catat grup utamanya.
// Atau jika 1 email bisa beli banyak produk, strukturnya harus beda lagi. 
// UNTUK KASUS INI: Kita asumsikan 1 email terdaftar di sistem, groupName adalah grup asal data terakhir.

module.exports = mongoose.model('Member', MemberSchema);