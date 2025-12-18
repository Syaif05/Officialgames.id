const { google } = require('googleapis');
const DriveMember = require('../models/DriveMember');

exports.syncDrivePermissions = async (userAccessToken, driveId) => {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: userAccessToken });
    
    const service = google.drive({ version: 'v3', auth });

    let allPermissions = [];

    const fetchWithMode = async (isAdminMode) => {
        let permissions = [];
        let pageToken; 

        do {
            const params = {
                fileId: driveId,
                supportsAllDrives: true,
                fields: 'nextPageToken, permissions(id, emailAddress, role, type, displayName, photoLink)',
                pageSize: 100
            };

            if (pageToken) {
                params.pageToken = pageToken;
            }

            if (isAdminMode) {
                params.useDomainAdminAccess = true;
            }

            const res = await service.permissions.list(params);
            
            if (res.data.permissions) {
                permissions = permissions.concat(res.data.permissions);
            }
            pageToken = res.data.nextPageToken;
        } while (pageToken);
        
        return permissions;
    };

    try {
        try {
            allPermissions = await fetchWithMode(true);
        } catch (adminError) {
            if (adminError.code === 403 || adminError.code === 404) {
                allPermissions = await fetchWithMode(false);
            } else {
                throw adminError;
            }
        }

        if (allPermissions.length > 0) {
            await DriveMember.deleteMany({ driveId: driveId });

            const bulkOps = allPermissions.map(perm => ({
                insertOne: {
                    document: {
                        driveId: driveId,
                        permissionId: perm.id,
                        email: perm.emailAddress || 'Grup/Domain (No Email)',
                        displayName: perm.displayName || 'Unknown',
                        role: perm.role,
                        type: perm.type,
                        photoLink: perm.photoLink || '',
                        lastSync: new Date()
                    }
                }
            }));

            await DriveMember.bulkWrite(bulkOps);
        }

        return { count: allPermissions.length };

    } catch (error) {
        console.error(error);
        let msg = "Gagal membaca member drive.";
        if (error.code === 404) msg = "Folder/Drive tidak ditemukan. Periksa ID Drive.";
        if (error.code === 403) msg = "Izin ditolak sepenuhnya. Pastikan akun Anda memiliki akses ke folder ini.";
        
        throw new Error(msg + " (" + error.message + ")");
    }
};