const { google } = require('googleapis');
const Member = require('../models/Member');
const ActivityLog = require('../models/ActivityLog');

exports.syncGroup = async (userAccessToken, adminEmail, groupEmail) => {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: userAccessToken });
    
    const service = google.admin({ version: 'directory_v1', auth });

    let googleMembers = [];
    let pageToken = null;

    try {
        do {
            const response = await service.members.list({
                groupKey: groupEmail,
                maxResults: 200,
                pageToken: pageToken
            });
            
            if (response.data.members) {
                googleMembers = googleMembers.concat(response.data.members);
            }
            pageToken = response.data.nextPageToken;
        } while (pageToken);
    } catch (error) {
        console.error("Google API Error:", error.message);
        if (error.code === 403) {
            throw new Error(`Akses Ditolak ke grup '${groupEmail}'. Pastikan:\n1. Akun login adalah Super Admin.\n2. Grup ini dibuat DI DALAM organisasi Workspace Anda (bukan @gmail.com atau @googlegroups.com).`);
        }
        throw error;
    }

    // Ambil data lama untuk perbandingan
    const dbMembers = await Member.find({ groupName: groupEmail });
    const dbMemberMap = new Map(dbMembers.map(m => [m.email, m]));
    
    const logsToInsert = [];
    const bulkOps = [];
    const incomingEmails = new Set();
    const now = new Date();

    let newCount = 0;
    let updateCount = 0;

    for (const gMember of googleMembers) {
        incomingEmails.add(gMember.email);
        const existingMember = dbMemberMap.get(gMember.email);
        
        // Fallback nama jika kosong
        const name = gMember.name && gMember.name.fullName ? gMember.name.fullName : gMember.email.split('@')[0];
        const role = gMember.role ? gMember.role.toLowerCase() : 'member';

        if (!existingMember) {
            // --- MEMBER BARU ---
            newCount++;
            logsToInsert.push({
                action: 'JOIN',
                targetEmail: gMember.email,
                targetName: name,
                groupName: groupEmail,
                details: `Bergabung sebagai ${role}`,
                performedBy: adminEmail,
                timestamp: now
            });

            bulkOps.push({
                updateOne: {
                    filter: { email: gMember.email },
                    update: { 
                        $set: {
                            email: gMember.email,
                            name, 
                            role, 
                            status: 'active', 
                            groupName: groupEmail, 
                            joinDate: now, // Set Tanggal Gabung = SEKARANG
                            lastSync: now 
                        }
                    },
                    upsert: true
                }
            });

        } else {
            // --- MEMBER LAMA ---
            let changes = [];
            if (existingMember.role !== role) changes.push(`Role: ${existingMember.role} -> ${role}`);
            if (existingMember.status === 'terpental') changes.push('Re-join (Aktif Kembali)');

            if (changes.length > 0) {
                updateCount++;
                logsToInsert.push({
                    action: 'UPDATE',
                    targetEmail: gMember.email,
                    targetName: name,
                    groupName: groupEmail,
                    details: changes.join(', '),
                    performedBy: adminEmail,
                    timestamp: now
                });
            }

            // Update data (TAPI JANGAN TIMPA joinDate JIKA SUDAH ADA)
            bulkOps.push({
                updateOne: {
                    filter: { email: gMember.email },
                    update: { 
                        $set: { 
                            name, 
                            role, 
                            status: 'active', 
                            groupName: groupEmail, 
                            lastSync: now 
                        },
                        $setOnInsert: { joinDate: now } // Hanya set joinDate jika ini insert baru (jaga-jaga)
                    }
                }
            });
        }
    }

    // --- MEMBER KELUAR ---
    for (const dbMember of dbMembers) {
        if (!incomingEmails.has(dbMember.email) && dbMember.status === 'active') {
            logsToInsert.push({
                action: 'LEFT',
                targetEmail: dbMember.email,
                targetName: dbMember.name,
                groupName: groupEmail,
                details: 'Keluar / Dikeluarkan dari grup',
                performedBy: adminEmail,
                timestamp: now
            });
            
            bulkOps.push({
                updateOne: {
                    filter: { email: dbMember.email },
                    update: { $set: { status: 'terpental' } }
                }
            });
        }
    }

    if (bulkOps.length > 0) await Member.bulkWrite(bulkOps);
    if (logsToInsert.length > 0) await ActivityLog.insertMany(logsToInsert);

    return { newCount, updateCount, totalGoogle: googleMembers.length };
};