const mongoose = require('mongoose');

const DriveMemberSchema = new mongoose.Schema({
    driveId: { type: String, required: true, index: true }, // ID Drive Bersama
    permissionId: { type: String, required: true },
    email: { type: String },
    displayName: { type: String },
    role: { type: String }, // organizer, fileOrganizer, writer, reader
    type: { type: String }, // user, group, domain
    photoLink: { type: String },
    lastSync: { type: Date, default: Date.now }
});

module.exports = mongoose.models.DriveMember || mongoose.model('DriveMember', DriveMemberSchema);