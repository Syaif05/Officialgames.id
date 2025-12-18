const { google } = require('googleapis');
const getFileModel = require('../models/File');
const Drive = require('../models/Drive');

exports.syncFiles = async (userAccessToken, mongoDriveId) => {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: userAccessToken });
    const service = google.drive({ version: 'v3', auth });

    // 1. Ambil Info Drive dari Database
    const driveInfo = await Drive.findById(mongoDriveId);
    if (!driveInfo) throw new Error("Database tidak ditemukan.");

    const collectionName = `files_${driveInfo.slug.replace(/-/g, '_')}`;
    const FileModel = getFileModel(collectionName);

    // --- LOGIKA SMART SYNC ---
    if (driveInfo.driveChangeToken) {
        console.log(`⚡ SMART SYNC: Mendeteksi perubahan di ${driveInfo.name}...`);
        try {
            return await syncIncremental(service, driveInfo, FileModel);
        } catch (err) {
            // Jika token kadaluarsa/rusak (Error 400/410), fallback ke Full Sync
            console.warn("⚠️ Token kadaluarsa, mengulang Full Sync...", err.message);
            driveInfo.driveChangeToken = null; // Reset token
            // Lanjut ke bawah (Full Sync)
        }
    }

    // --- FULL SYNC (Hanya jika belum punya token atau token rusak) ---
    console.log(`🔄 FULL SYNC: Membaca ulang seluruh data ${driveInfo.name}...`);
    
    // PENTING: Minta Token Start DULU sebelum scan, agar perubahan saat scan tidak hilang
    const tokenRes = await service.changes.getStartPageToken({
        driveId: driveInfo.rootFolderId,
        supportsAllDrives: true
    });
    const startToken = tokenRes.data.startPageToken;

    // Lakukan Full Scan
    const count = await syncFull(service, driveInfo.rootFolderId, FileModel);

    // Simpan Token & Update Status
    driveInfo.driveChangeToken = startToken;
    driveInfo.lastSync = new Date();
    driveInfo.totalFiles = count;
    await driveInfo.save();
    
    return { count, method: 'FULL' };
};

// === FUNGSI 1: INCREMENTAL SYNC (CEPAT) ===
async function syncIncremental(service, driveInfo, FileModel) {
    let pageToken = driveInfo.driveChangeToken;
    let changeCount = 0;

    while (pageToken) {
        const res = await service.changes.list({
            driveId: driveInfo.rootFolderId,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            pageToken: pageToken,
            fields: 'newStartPageToken, nextPageToken, changes(fileId, removed, file(name, mimeType, parents, size, iconLink, webViewLink))'
        });

        const changes = res.data.changes;
        if (changes && changes.length > 0) {
            const bulkOps = [];
            
            for (const change of changes) {
                if (change.removed) {
                    // File Dihapus di Google -> Hapus di DB
                    bulkOps.push({
                        deleteOne: { filter: { driveId: change.fileId } }
                    });
                } else {
                    // File Baru / Edit -> Upsert di DB
                    const file = change.file;
                    if (file) {
                         bulkOps.push({
                            updateOne: {
                                filter: { driveId: change.fileId },
                                update: { 
                                    $set: {
                                        driveId: change.fileId,
                                        name: file.name,
                                        mimeType: file.mimeType,
                                        parents: file.parents || [],
                                        size: file.size || '0',
                                        iconLink: file.iconLink,
                                        webViewLink: file.webViewLink
                                    }
                                },
                                upsert: true
                            }
                        });
                    }
                }
            }

            if (bulkOps.length > 0) {
                await FileModel.bulkWrite(bulkOps);
                changeCount += changes.length;
            }
        }

        if (res.data.newStartPageToken) {
            // Selesai! Simpan token masa depan
            driveInfo.driveChangeToken = res.data.newStartPageToken;
            pageToken = null; 
        } else {
            // Lanjut halaman berikutnya
            pageToken = res.data.nextPageToken;
        }
    }

    // Update Hitungan Total File (Agar akurat setelah tambah/hapus)
    const realTotal = await FileModel.countDocuments();
    driveInfo.totalFiles = realTotal;
    driveInfo.lastSync = new Date();
    await driveInfo.save();

    console.log(`✅ Selesai! ${changeCount} perubahan diproses.`);
    return { count: changeCount, method: 'INCREMENTAL' };
}

// === FUNGSI 2: FULL SCAN (LAMBAT - INITIAL) ===
async function syncFull(service, driveId, FileModel) {
    let pageToken = null;
    let totalProcessed = 0;
    let fileIdsFound = new Set(); // Untuk deteksi file sampah

    do {
        const res = await service.files.list({
            corpora: 'drive',
            driveId: driveId,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            q: "trashed = false",
            fields: 'nextPageToken, files(id, name, mimeType, parents, size, iconLink, webViewLink)',
            pageSize: 1000, 
            pageToken: pageToken
        });

        const files = res.data.files;
        if (files && files.length > 0) {
            const bulkOps = [];
            for (const file of files) {
                fileIdsFound.add(file.id);
                bulkOps.push({
                    updateOne: {
                        filter: { driveId: file.id },
                        update: { 
                            $set: {
                                driveId: file.id,
                                name: file.name,
                                mimeType: file.mimeType,
                                parents: file.parents || [],
                                size: file.size || '0',
                                iconLink: file.iconLink,
                                webViewLink: file.webViewLink
                            }
                        },
                        upsert: true
                    }
                });
            }
            if (bulkOps.length > 0) {
                await FileModel.bulkWrite(bulkOps);
                totalProcessed += files.length;
                process.stdout.write("."); // Indikator loading titik-titik
            }
        }
        pageToken = res.data.nextPageToken;
    } while (pageToken);

    // Bersihkan file yang ada di DB tapi tidak ditemukan di Google (File sampah/hapusan lama)
    if (totalProcessed > 0) {
        const allDbFiles = await FileModel.find({}, 'driveId');
        const idsToDelete = allDbFiles
            .filter(f => !fileIdsFound.has(f.driveId))
            .map(f => f.driveId);

        if (idsToDelete.length > 0) {
            await FileModel.deleteMany({ driveId: { $in: idsToDelete } });
            console.log(`🗑️ Membersihkan ${idsToDelete.length} file usang.`);
        }
    }

    return totalProcessed;
}