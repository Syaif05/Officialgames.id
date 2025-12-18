const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
    action: { type: String, required: true },
    targetEmail: { type: String },
    targetName: { type: String },
    details: { type: String },
    performedBy: { type: String, default: 'System' },
    groupName: { type: String },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);