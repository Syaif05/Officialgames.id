const { google } = require('googleapis');
const path = require('path');
const getFileModel = require('../models/File'); // Import fungsi dinamis tadi
const Drive = require('../models/Drive');

const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, '../service-account.json'),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});

const drive = google.drive({ version: 'v3', auth });
let activeConnections = {}; // Ubah jadi object biar bisa kirim ke ID spesifik

const sendEvent = (driveId, data) => {
    // Kirim event hanya ke client yang sedang memantau drive ini
    if (activeConnections[driveId]) {
        activeConnections[driveId].write(`data: ${JSON.stringify(data)}\n\n`);
    }
};

async function syncDrive(driveId, mongoDriveId) {
    try {
        // Ambil info drive untuk tau nama collection-nya
        const driveInfo = await Drive.findById(mongoDriveId);
        if (!driveInfo) throw new Error("Database tidak ditemukan");

        // Tentukan nama collection: "files_slug" (contoh: files_film-action)
        const collectionName = `files_${driveInfo.slug.replace(/-/g, '_')}`;
        const FileModel = getFileModel(collectionName);

        sendEvent(mongoDriveId, { type: 'start', message: 'Memulai koneksi...' });

        // Ambil data lama dari collection KHUSUS ini
        const existingFiles = await FileModel.find({}).select('driveId');
        const existingIds = new Set(existingFiles.map(f => f.driveId));
        const foundIds = new Set();
        
        let processedCount = 0;

        // Proses Recursive
        await processFolderRecursive(driveId, FileModel, existingIds, foundIds, (count) => {
            processedCount += count;
            sendEvent(mongoDriveId, { type: 'progress', message: `Memindai ${processedCount} file...`, count: processedCount });
        });

        sendEvent(mongoDriveId, { type: 'cleaning', message: 'Membersihkan data lama...' });
        
        // Hapus file yang sudah tidak ada di Drive
        const deleteOps = [];
        for (const id of existingIds) {
            if (!foundIds.has(id)) deleteOps.push(id);
        }

        if (deleteOps.length > 0) {
            await FileModel.deleteMany({ driveId: { $in: deleteOps } });
        }

        // Update Info Utama
        const total = await FileModel.countDocuments();
        await Drive.findByIdAndUpdate(mongoDriveId, { lastSync: new Date(), totalFiles: total });

        sendEvent(mongoDriveId, { type: 'complete', message: 'Selesai!', total: total });

    } catch (error) {
        console.error(error);
        sendEvent(mongoDriveId, { type: 'error', message: error.message });
    }
}

async function processFolderRecursive(folderId, FileModel, existingIds, foundIds, onProgress) {
    let pageToken = null;
    do {
        try {
            const res = await drive.files.list({
                q: `'${folderId}' in parents and trashed = false`,
                fields: 'nextPageToken, files(id, name, mimeType, parents, size, iconLink)',
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
                pageSize: 1000,
                pageToken: pageToken
            });

            const files = res.data.files;
            if (files.length) {
                const bulkOps = [];
                
                for (const file of files) {
                    foundIds.add(file.id);
                    
                    bulkOps.push({
                        updateOne: {
                            filter: { driveId: file.id }, // Tidak perlu filter driveRef lagi karena collection sudah beda
                            update: { 
                                $set: {
                                    driveId: file.id,
                                    name: file.name,
                                    mimeType: file.mimeType,
                                    parents: file.parents,
                                    size: file.size || '0',
                                    iconLink: file.iconLink
                                }
                            },
                            upsert: true
                        }
                    });

                    if (file.mimeType === 'application/vnd.google-apps.folder') {
                        await processFolderRecursive(file.id, FileModel, existingIds, foundIds, onProgress);
                    }
                }

                if (bulkOps.length > 0) {
                    await FileModel.bulkWrite(bulkOps);
                    onProgress(files.length);
                }
            }
            pageToken = res.data.nextPageToken;
        } catch (err) {
            console.error("Error folder:", folderId, err.message);
            pageToken = null;
        }
    } while (pageToken);
}

module.exports = {
    syncDrive,
    addClient: (driveId, res) => {
        // Simpan koneksi berdasarkan ID Drive agar event tidak nyasar ke drive lain
        activeConnections[driveId] = res;
        res.on('close', () => {
            delete activeConnections[driveId];
        });
    }
};