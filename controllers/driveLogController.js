const Drive = require('../models/Drive');
const DriveLog = require('../models/DriveLog');
const DriveMember = require('../models/DriveMember');
const getFileModel = require('../models/File');
const driveActivityService = require('../services/driveActivityService');
const drivePermissionService = require('../services/drivePermissionService');

exports.listLogs = async (req, res) => {
    try {
        const filterDrive = req.query.driveId || ''; 
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const activeTab = req.query.tab || 'stats';
        const filterAction = req.query.action || '';
        const searchLog = req.query.searchLog || '';
        const searchMember = req.query.searchMember || '';
        const filterRole = req.query.role || '';

        // OVERVIEW MODE
        if (!filterDrive) {
            const allDrives = await Drive.find({}, 'name rootFolderId imageUrl lastLogSync lastSync totalFiles slug');
            
            const overviewStats = await Promise.all(allDrives.map(async (d) => {
                const logCount = await DriveLog.countDocuments({ driveId: d.rootFolderId });
                const memberCount = await DriveMember.countDocuments({ driveId: d.rootFolderId });
                
                return {
                    ...d.toObject(),
                    logCount,
                    memberCount,
                    // Tampilkan lastLogSync (Aktivitas) atau lastSync (File)
                    lastActivity: d.lastLogSync || d.lastSync 
                };
            }));

            return res.render('admin/drive-logs', {
                viewMode: 'overview',
                drives: overviewStats,
                msg: req.query.msg,
                error: req.query.error
            });
        }

        // DETAIL MODE
        const driveInfo = await Drive.findOne({ rootFolderId: filterDrive });
        if (!driveInfo) return res.redirect('/admin/drive-logs');

        const allDrives = await Drive.find({}, 'name rootFolderId');
        let stats = { totalFiles: 0, totalSize: '0 B', totalMembers: 0, lastSync: null };
        let logs = [];
        let members = [];
        let logCounts = { ALL: 0, UPLOAD: 0, EDIT: 0, DELETE: 0, PERMISSION: 0 };
        let pagination = { current: 1, total: 1 };

        // 1. Stats File
        const collectionName = `files_${driveInfo.slug.replace(/-/g, '_')}`;
        const FileModel = getFileModel(collectionName);
        try {
            const fileStats = await FileModel.aggregate([{ $group: { _id: null, count: { $sum: 1 }, totalSize: { $sum: { $toDouble: "$size" } } } }]);
            if (fileStats.length > 0) {
                stats.totalFiles = fileStats[0].count;
                stats.totalSize = formatBytes(fileStats[0].totalSize);
            }
        } catch (e) {}
        
        // Gunakan lastLogSync untuk tab aktivitas, lastSync untuk file
        stats.lastSync = driveInfo.lastLogSync || driveInfo.lastSync;

        // 2. Members
        let memberQuery = { driveId: filterDrive };
        if (searchMember) {
            memberQuery.$or = [{ displayName: { $regex: searchMember, $options: 'i' } }, { email: { $regex: searchMember, $options: 'i' } }];
        }
        if (filterRole) memberQuery.role = filterRole;
        members = await DriveMember.find(memberQuery).sort({ role: 1 });
        stats.totalMembers = await DriveMember.countDocuments({ driveId: filterDrive });

        // 3. Log Counts
        const logAgg = await DriveLog.aggregate([
            { $match: { driveId: filterDrive } },
            { $group: { _id: "$action", count: { $sum: 1 } } }
        ]);
        let totalLogCount = 0;
        logAgg.forEach(g => { if (logCounts[g._id] !== undefined) logCounts[g._id] = g.count; totalLogCount += g.count; });
        logCounts.ALL = totalLogCount;

        // 4. Logs Query
        let logQuery = { driveId: filterDrive };
        if (searchLog) {
            logQuery.$or = [{ targetName: { $regex: searchLog, $options: 'i' } }, { actorEmail: { $regex: searchLog, $options: 'i' } }, { actorName: { $regex: searchLog, $options: 'i' } }];
        }
        if (filterAction) logQuery.action = filterAction;

        const currentLogsCount = await DriveLog.countDocuments(logQuery);
        logs = await DriveLog.find(logQuery).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(limit);
        pagination = { current: page, total: Math.ceil(currentLogsCount / limit) };

        res.render('admin/drive-logs', {
            viewMode: 'detail',
            driveInfo, allDrives, filterDrive, stats, logs, members, logCounts, filterAction, pagination, activeTab,
            searchLog, searchMember, filterRole,
            msg: req.query.msg, error: req.query.error
        });

    } catch (error) {
        res.status(500).send("Server Error: " + error.message);
    }
};

// SYNC LOGS (INCREMENTAL)
exports.syncLogs = async (req, res) => {
    const { driveId } = req.body;
    try {
        if (!req.user || !req.user.accessToken) return res.redirect('/auth/google');
        
        // 1. Ambil Data Drive untuk cek lastLogSync
        const drive = await Drive.findOne({ rootFolderId: driveId });
        
        // 2. Kirim lastLogSync ke Service (Bisa null jika belum pernah)
        const result = await driveActivityService.syncActivity(req.user.accessToken, driveId, drive.lastLogSync);
        
        // 3. Update Waktu Sync
        drive.lastLogSync = new Date();
        await drive.save();

        res.redirect(`/admin/drive-logs?driveId=${driveId}&tab=activity&msg=Sukses! ${result.count} aktivitas baru ditambahkan.`);
    } catch (error) {
        res.redirect(`/admin/drive-logs?driveId=${driveId}&tab=activity&error=${encodeURIComponent(error.message)}`);
    }
};

// SYNC MEMBERS
exports.syncDriveMembers = async (req, res) => {
    const { driveId } = req.body;
    try {
        if (!req.user || !req.user.accessToken) return res.redirect('/auth/google');
        await drivePermissionService.syncDrivePermissions(req.user.accessToken, driveId);
        res.redirect(`/admin/drive-logs?driveId=${driveId}&tab=members&msg=Sukses update data member.`);
    } catch (error) {
        res.redirect(`/admin/drive-logs?driveId=${driveId}&tab=members&error=${encodeURIComponent(error.message)}`);
    }
};

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}