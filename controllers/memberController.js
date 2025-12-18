const Member = require('../models/Member');
const ActivityLog = require('../models/ActivityLog');
const memberSyncService = require('../services/memberSyncService');

// --- LIST MEMBERS & LOGS (DUAL PAGINATION & SORTING) ---
exports.listMembers = async (req, res) => {
    try {
        const selectedGroup = req.query.group || null;
        const msg = req.query.msg || '';
        const activeTab = req.query.activeTab || 'members';

        if (!selectedGroup) {
            // MODE 1: OVERVIEW (GRUP)
            const totalAll = await Member.countDocuments();
            const groupStats = await Member.aggregate([
                {
                    $group: {
                        _id: "$groupName",
                        totalMembers: { $sum: 1 },
                        lastSync: { $max: "$lastSync" },
                        activeCount: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } }
                    }
                },
                { $sort: { lastSync: -1 } }
            ]);

            return res.render('admin/members', { 
                viewMode: 'groups', // PENTING: Flag untuk view
                groups: groupStats,
                msg,
                totalMembers: totalAll
            });

        } else {
            // MODE 2: DETAIL GRUP (DASHBOARD)
            const limit = 50;
            const memberPage = parseInt(req.query.page) || 1;
            const search = req.query.q || '';
            const statusFilter = req.query.status || '';
            const roleFilter = req.query.role || '';
            const sortParam = req.query.sort || 'default';
            const logPage = parseInt(req.query.logPage) || 1;
            const logSortParam = req.query.logSort || 'newest';

            // 1. Statistik Header
            const statsData = await Member.aggregate([
                { $match: { groupName: selectedGroup } },
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
                        terpental: { $sum: { $cond: [{ $eq: ["$status", "terpental"] }, 1, 0] } },
                        owner: { $sum: { $cond: [{ $or: [{ $eq: ["$role", "owner"] }, { $eq: ["$role", "pemilik"] }] }, 1, 0] } },
                        manager: { $sum: { $cond: [{ $or: [{ $eq: ["$role", "manager"] }, { $eq: ["$role", "pengelola"] }] }, 1, 0] } },
                        member: { $sum: { $cond: [{ $or: [{ $eq: ["$role", "member"] }, { $eq: ["$role", "anggota"] }] }, 1, 0] } },
                        lastSync: { $max: "$lastSync" }
                    }
                }
            ]);
            const stats = statsData.length > 0 ? statsData[0] : { total: 0, active: 0, terpental: 0, owner: 0, manager: 0, member: 0, lastSync: new Date() };

            // 2. Query Data Member
            let query = { groupName: selectedGroup };
            if (search) {
                query.$or = [{ email: { $regex: search, $options: 'i' } }, { name: { $regex: search, $options: 'i' } }];
            }
            if (statusFilter) query.status = statusFilter;
            if (roleFilter) query.role = roleFilter;

            let sortQuery = {};
            switch(sortParam) {
                case 'newest': sortQuery = { joinDate: -1 }; break;
                case 'oldest': sortQuery = { joinDate: 1 }; break;
                case 'a-z': sortQuery = { name: 1 }; break;
                case 'z-a': sortQuery = { name: -1 }; break;
                default: sortQuery = { role: 1, status: 1 };
            }

            const totalFilteredData = await Member.countDocuments(query);
            const members = await Member.find(query)
                .sort(sortQuery)
                .skip((memberPage - 1) * limit)
                .limit(limit);

            // 3. Query Data Logs
            let logSortQuery = {};
            switch(logSortParam) {
                case 'newest': logSortQuery = { timestamp: -1 }; break;
                case 'oldest': logSortQuery = { timestamp: 1 }; break;
                case 'action-a-z': logSortQuery = { action: 1, timestamp: -1 }; break;
                case 'action-z-a': logSortQuery = { action: -1, timestamp: -1 }; break;
                default: logSortQuery = { timestamp: -1 };
            }

            const totalLogs = await ActivityLog.countDocuments({ groupName: selectedGroup });
            const groupLogs = await ActivityLog.find({ groupName: selectedGroup })
                .sort(logSortQuery)
                .skip((logPage - 1) * limit)
                .limit(limit);

            return res.render('admin/members', { 
                viewMode: 'detail', // PENTING: Flag untuk view
                selectedGroup,
                stats,
                msg,
                activeTab,
                
                members, 
                currentPage: memberPage, 
                totalPages: Math.ceil(totalFilteredData / limit),
                totalMembers: totalFilteredData,
                search, statusFilter, roleFilter, sortParam,

                logs: groupLogs,
                currentLogPage: logPage,
                totalLogPages: Math.ceil(totalLogs / limit),
                logSortParam
            });
        }
    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
};

// --- ACTIVITY LOG GLOBAL ---
exports.listActivityLogs = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const search = req.query.q || '';
        let query = {};
        if (search) {
            query.$or = [
                { targetEmail: { $regex: search, $options: 'i' } },
                { details: { $regex: search, $options: 'i' } },
                { groupName: { $regex: search, $options: 'i' } }
            ];
        }
        const totalLogs = await ActivityLog.countDocuments(query);
        const logs = await ActivityLog.find(query).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(limit);
        
        res.render('admin/activity-logs', { 
            logs, 
            currentPage: page, 
            totalPages: Math.ceil(totalLogs / limit), 
            search, 
            totalLogs 
        });
    } catch (error) { res.status(500).send(error.message); }
};

// --- SYNC & EXPORT ---
exports.exportGroupLogs = async (req, res) => {
    try {
        const groupName = req.query.group;
        if (!groupName) return res.status(400).send("Parameter grup tidak ditemukan.");
        const logs = await ActivityLog.find({ groupName }).sort({ timestamp: -1 });
        let csvContent = "Waktu,Aksi,Nama Anggota,Email Anggota,Keterangan,Eksekutor\n";
        logs.forEach(log => {
            const time = new Date(log.timestamp).toLocaleString('id-ID');
            const action = log.action;
            const name = log.targetName ? `"${log.targetName.replace(/"/g, '""')}"` : '-';
            const email = log.targetEmail || '-';
            const details = log.details ? `"${log.details.replace(/"/g, '""')}"` : '-';
            const executor = log.performedBy || 'System';
            csvContent += `${time},${action},${name},${email},${details},${executor}\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="activity-log-${groupName}.csv"`);
        res.status(200).send(csvContent);
    } catch (error) { res.status(500).send("Gagal export CSV: " + error.message); }
};

exports.syncDirectGroup = async (req, res) => {
    try {
        if (!req.user || !req.user.accessToken) return res.redirect('/auth/google'); 
        const { groupEmail } = req.body;
        if (!groupEmail) return res.redirect('/admin/members?msg=Error: Email grup wajib diisi');
        try {
            const result = await memberSyncService.syncGroup(req.user.accessToken, req.user.email, groupEmail);
            res.redirect(`/admin/members?group=${encodeURIComponent(groupEmail)}&msg=Sukses! ${result.newCount} Anggota Baru, ${result.updateCount} Update.`);
        } catch (googleErr) {
            return res.redirect('/admin/members?msg=Gagal: ' + googleErr.message);
        }
    } catch (error) {
        res.redirect('/admin/members?msg=System Error: ' + error.message);
    }
};