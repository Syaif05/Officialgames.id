const { google } = require('googleapis');
const DriveLog = require('../models/DriveLog');

exports.syncActivity = async (userAccessToken, driveId, lastSyncDate) => {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: userAccessToken });
    
    const service = google.driveactivity({ version: 'v2', auth });
    const peopleService = google.people({ version: 'v1', auth });

    if (!driveId || driveId.length < 5) throw new Error("ID Drive tidak valid.");

    const itemName = `items/${driveId}`;
    let pageToken = null;
    let newLogsCount = 0;
    let isIncremental = false;

    // --- LOGIKA FILTER PINTAR ---
    let filterStr = "detail.action_detail_case:(CREATE EDIT MOVE DELETE RENAME PERMISSION_CHANGE RESTORE)";
    
    // Jika sudah pernah sync, ambil data SETELAH waktu terakhir (Incremental)
    if (lastSyncDate) {
        const timeMillis = new Date(lastSyncDate).getTime();
        filterStr += ` AND time > ${timeMillis}`;
        isIncremental = true;
        console.log(`🔄 Sync Incremental: Mengambil data setelah ${lastSyncDate}`);
    } else {
        console.log(`🆕 Sync Awal: Mengambil data terbaru saja.`);
    }
    // ---------------------------

    try {
        let pageCount = 0;
        
        // Jika Incremental (Update), kita ambil semua halaman sampai habis (Unlimited)
        // Jika Awal (Preview), kita batasi 3 halaman saja biar cepat
        const MAX_PAGES = isIncremental ? 100 : 3; 

        do {
            const res = await service.activity.query({
                requestBody: {
                    ancestorName: itemName,
                    consolidationStrategy: { legacy: {} },
                    pageSize: 50, 
                    pageToken: pageToken,
                    filter: filterStr 
                }
            });

            const activities = res.data.activities;
            if (activities && activities.length > 0) {
                
                // 1. Kumpulkan ID Pelaku
                const personNames = new Set();
                activities.forEach(act => {
                    if (act.actors && act.actors[0] && act.actors[0].user && act.actors[0].user.knownUser) {
                        personNames.add(act.actors[0].user.knownUser.personName);
                    }
                });

                // 2. Terjemahkan ID -> Nama (Batch Lookup)
                const peopleMap = new Map();
                if (personNames.size > 0) {
                    try {
                        const peopleRes = await peopleService.people.getBatchGet({
                            resourceNames: Array.from(personNames),
                            personFields: 'names,emailAddresses'
                        });
                        if (peopleRes.data.responses) {
                            peopleRes.data.responses.forEach(response => {
                                if (response.person) {
                                    const p = response.person;
                                    const id = p.resourceName;
                                    const name = p.names ? p.names[0].displayName : 'Tanpa Nama';
                                    const email = p.emailAddresses ? p.emailAddresses[0].value : 'No Email';
                                    peopleMap.set(id, { name, email });
                                }
                            });
                        }
                    } catch (err) { /* Ignore People API error */ }
                }

                // 3. Simpan ke DB
                const bulkOps = [];
                for (const activity of activities) {
                    const actionData = parseAction(activity.primaryActionDetail);
                    const actorData = parseActor(activity.actors[0], peopleMap);
                    const targetData = parseTarget(activity.targets[0]);
                    
                    let time;
                    if (activity.timestamp) time = new Date(activity.timestamp);
                    else if (activity.timeRange && activity.timeRange.endTime) time = new Date(activity.timeRange.endTime);
                    else time = new Date();

                    // Cek Duplikat (Double Check)
                    const exists = await DriveLog.findOne({
                        driveId: driveId,
                        timestamp: time,
                        actorEmail: actorData.email,
                        action: actionData.type
                    });

                    if (!exists) {
                        newLogsCount++;
                        bulkOps.push({
                            insertOne: {
                                document: {
                                    driveId: driveId,
                                    action: actionData.type,
                                    details: actionData.detail,
                                    actorEmail: actorData.email,
                                    actorName: actorData.name,
                                    targetName: targetData.name,
                                    targetType: targetData.type,
                                    timestamp: time
                                }
                            }
                        });
                    }
                }

                if (bulkOps.length > 0) {
                    await DriveLog.bulkWrite(bulkOps);
                }
            }

            pageToken = res.data.nextPageToken;
            pageCount++;
            if (pageCount >= MAX_PAGES) pageToken = null; 

        } while (pageToken);

        return { count: newLogsCount };

    } catch (error) {
        if (error.message && error.message.includes('Drive Activity API has not been used')) {
            throw new Error("API Belum Aktif. Buka Google Console dan aktifkan 'Google Drive Activity API'.");
        }
        console.error("Drive Activity Service Error:", error);
        throw new Error("Gagal sinkronisasi aktivitas: " + error.message);
    }
};

// --- HELPER FUNCTIONS ---
function parseAction(detail) {
    if (!detail) return { type: 'UNKNOWN', detail: '-' };
    if (detail.create) return { type: 'UPLOAD', detail: 'Upload/Buat baru' };
    if (detail.edit) return { type: 'EDIT', detail: 'Edit file' };
    if (detail.move) return { type: 'MOVE', detail: 'Memindahkan file' };
    if (detail.delete) return { type: 'DELETE', detail: 'Menghapus file' };
    if (detail.restore) return { type: 'RESTORE', detail: 'Memulihkan file' };
    if (detail.rename) return { type: 'RENAME', detail: 'Ganti nama' };
    if (detail.permissionChange) return { type: 'PERMISSION', detail: 'Ubah akses/sharing' };
    return { type: 'OTHER', detail: 'Aktivitas lain' };
}

function parseActor(actor, peopleMap) {
    if (!actor) return { email: 'Unknown', name: 'Unknown' };
    if (actor.user && actor.user.knownUser) {
        const personId = actor.user.knownUser.personName;
        if (peopleMap && peopleMap.has(personId)) return peopleMap.get(personId);
        return { email: 'User (No Email)', name: 'Google User' };
    }
    if (actor.impersonation) return { email: 'Super Admin', name: 'Admin (Impersonated)' };
    if (actor.system) return { email: 'System', name: 'Google System' };
    return { email: 'Unknown', name: 'Unknown' };
}

function parseTarget(target) {
    if (!target || !target.driveItem) return { name: 'Unknown', type: 'UNKNOWN' };
    return { 
        name: target.driveItem.title || 'Tanpa Nama',
        type: target.driveItem.mimeType && target.driveItem.mimeType.includes('folder') ? 'FOLDER' : 'FILE'
    };
}