const { google } = require('googleapis');
const path = require('path');
const getFileModel = require('../models/File');
const Drive = require('../models/Drive');

// Setup Auth Google
const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, '../service-account.json'),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});

const drive = google.drive({ version: 'v3', auth });
let activeConnections = {}; // Untuk kirim progress ke browser

// Helper: Kirim event progress bar
const sendEvent = (driveId, data) => {
    if (activeConnections[driveId]) {
        activeConnections[driveId].write(`data: ${JSON.stringify(data)}\n\n`);
    }
};

// Fungsi Utama: Manual Sync dari Localhost
async function manualSync(mongoDriveId) {
    try {
        const driveInfo = await Drive.findById(mongoDriveId);
        if (!driveInfo) return;

        const collectionName = `files_${driveInfo.slug.replace(/-/g, '_')}`;
        const FileModel = getFileModel(collectionName);

        sendEvent(mongoDriveId, { type: 'start', message: 'Memulai koneksi ke Google Drive...' });

        // 1. Ambil Data Lama di DB
        const existingFiles = await FileModel.find({}).select('driveId');
        const existingIds = new Set(existingFiles.map(f => f.driveId));
        const foundIds = new Set();
        
        let processedCount = 0;

        // 2. Scan Google Drive (Recursive)
        await processFolder(driveInfo.rootFolderId, FileModel, existingIds, foundIds, (count) => {
            processedCount += count;
            sendEvent(mongoDriveId, { type: 'progress', message: `Memindai ${processedCount} file...` });
        });

        // 3. Bersihkan File yang Dihapus
        sendEvent(mongoDriveId, { type: 'cleaning', message: 'Membersihkan data lama...' });
        const deleteOps = [];
        for (const id of existingIds) {
            if (!foundIds.has(id)) deleteOps.push(id);
        }
        if (deleteOps.length > 0) {
            await FileModel.deleteMany({ driveId: { $in: deleteOps } });
        }

        // 4. Update Status
        const total = await FileModel.countDocuments();
        await Drive.findByIdAndUpdate(mongoDriveId, { lastSync: new Date(), totalFiles: total });

        sendEvent(mongoDriveId, { type: 'complete', message: 'Selesai!', total: total });

    } catch (error) {
        console.error(error);
        sendEvent(mongoDriveId, { type: 'error', message: error.message });
    }
}

// Fungsi Recursive Scan
async function processFolder(folderId, FileModel, existingIds, foundIds, onProgress) {
    let pageToken = null;
    do {
        try {
            const res = await drive.files.list({
                q: `'${folderId}' in parents and trashed = false`,
                fields: 'nextPageToken, files(id, name, mimeType, parents, size, iconLink, webViewLink)',
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
                            filter: { driveId: file.id },
                            update: { 
                                $set: {
                                    driveId: file.id,
                                    name: file.name,
                                    mimeType: file.mimeType,
                                    parents: file.parents,
                                    size: file.size || '0',
                                    iconLink: file.iconLink,
                                    webViewLink: file.webViewLink
                                }
                            },
                            upsert: true
                        }
                    });

                    if (file.mimeType === 'application/vnd.google-apps.folder') {
                        await processFolder(file.id, FileModel, existingIds, foundIds, onProgress);
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
    manualSync,
    addClient: (driveId, res) => {
        activeConnections[driveId] = res;
        res.on('close', () => { delete activeConnections[driveId]; });
    }
};