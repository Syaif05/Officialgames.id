const mongoose = require('mongoose');

const DriveLogSchema = new mongoose.Schema({
    driveId: { type: String, required: true, index: true },
    action: { type: String, required: true },
    actorEmail: { type: String },
    actorName: { type: String }, // Field Baru: Nama Pelaku
    targetName: { type: String },
    targetType: { type: String },
    details: { type: String },
    timestamp: { type: Date, required: true, index: true }
});

module.exports = mongoose.models.DriveLog || mongoose.model('DriveLog', DriveLogSchema);