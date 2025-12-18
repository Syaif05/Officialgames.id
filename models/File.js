const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema({
    driveId: { type: String, required: true, unique: true },
    name: { type: String },
    mimeType: { type: String },
    parents: [{ type: String }],
    size: { type: String },
    iconLink: { type: String },
    webViewLink: { type: String },
    updatedAt: { type: Date, default: Date.now }
}, { strict: false });

const getFileModel = (collectionName) => {
    if (mongoose.models[collectionName]) {
        return mongoose.models[collectionName];
    }
    return mongoose.model(collectionName, FileSchema, collectionName);
};

module.exports = getFileModel;