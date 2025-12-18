const mongoose = require('mongoose');
const slugify = require('slugify');

const DriveSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, unique: true },
    rootFolderId: { type: String, required: true },
    imageUrl: { type: String, default: 'https://placehold.co/400x400/png?text=No+Image' },
    
    // Statistik File
    lastSync: { type: Date },
    totalFiles: { type: Number, default: 0 },
    
    // TOKEN PINTAR (INCREMENTAL SYNC)
    driveChangeToken: { type: String }, 

    // Log Aktivitas
    lastLogSync: { type: Date }
});

DriveSchema.pre('save', async function() {
    if (this.name && !this.slug) {
        let newSlug = slugify(this.name, { lower: true, strict: true });
        const existing = await mongoose.models.Drive.countDocuments({ slug: newSlug });
        if (existing > 0) {
            newSlug = newSlug + '-' + Math.floor(Math.random() * 1000);
        }
        this.slug = newSlug;
    }
});

module.exports = mongoose.model('Drive', DriveSchema);