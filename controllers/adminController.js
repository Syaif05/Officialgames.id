const Drive = require('../models/Drive');
const Member = require('../models/Member');
const DriveLog = require('../models/DriveLog');
const Setting = require('../models/Setting');
const Banner = require('../models/Banner');
const ActivityLog = require('../models/ActivityLog');

// --- 1. GRAND DASHBOARD ---
exports.dashboard = async (req, res) => {
    try {
        const totalDrives = await Drive.countDocuments();
        const totalMembers = await Member.countDocuments({ status: 'active' });
        const totalLogs = await ActivityLog.countDocuments();
        const activeBanners = await Banner.countDocuments({ isActive: true });
        const setting = await Setting.findOne();

        res.render('admin/dashboard', {
            title: 'Dashboard Utama',
            stats: { totalDrives, totalMembers, totalLogs, activeBanners },
            setting
        });
    } catch (error) { res.status(500).send('Server Error'); }
};

// --- 2. DATABASE HUB ---
exports.databaseHub = async (req, res) => {
    try {
        const recentDrives = await Drive.find().sort({ lastSync: -1 }).limit(3);
        const totalDrives = await Drive.countDocuments();
        const recentMembers = await Member.find().sort({ joinDate: -1 }).limit(5);
        const totalMembers = await Member.countDocuments();
        const recentLogs = await ActivityLog.find().sort({ timestamp: -1 }).limit(5);

        res.render('admin/database-hub', {
            title: 'Manajemen Database',
            recentDrives, totalDrives,
            recentMembers, totalMembers,
            recentLogs
        });
    } catch (error) { res.status(500).send(error.message); }
};

// --- 3. SYSTEM HUB ---
exports.systemHub = async (req, res) => {
    try {
        const setting = await Setting.findOne();
        const banners = await Banner.find().limit(3);
        const activeBannerCount = await Banner.countDocuments({ isActive: true });

        res.render('admin/system-hub', {
            title: 'Pengaturan Sistem',
            setting, banners, activeBannerCount
        });
    } catch (error) { res.status(500).send(error.message); }
};

// --- 4. MANAJEMEN DRIVES (LIST, CREATE, DELETE) ---
exports.listDrives = async (req, res) => {
    try {
        const drives = await Drive.find().sort({ lastSync: -1 });
        // Kirim logs kosong jika tidak ada, agar tidak error di view
        res.render('admin/drive-list', { drives, logs: [] });
    } catch (error) { res.status(500).send('Server Error: ' + error.message); }
};

exports.createDrive = async (req, res) => {
    try {
        const { name, rootFolderId, imageUrl, slug } = req.body;
        // Auto slug jika kosong
        const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        
        await Drive.create({
            name,
            rootFolderId,
            imageUrl,
            slug: finalSlug,
            lastSync: null
        });
        res.redirect('/admin/drives');
    } catch (error) {
        res.status(500).send('Gagal membuat database: ' + error.message);
    }
};

exports.deleteDrive = async (req, res) => {
    try {
        await Drive.findByIdAndDelete(req.params.id);
        // Opsi: Hapus juga file/log terkait jika perlu
        res.redirect('/admin/drives');
    } catch (error) {
        res.status(500).send('Gagal menghapus: ' + error.message);
    }
};

// --- 5. SETTINGS ---
exports.settings = async (req, res) => {
    try {
        const setting = await Setting.findOne();
        res.render('admin/settings', { setting, msg: req.query.msg });
    } catch (error) { res.status(500).send(error.message); }
};

exports.updateSettings = async (req, res) => {
    try {
        const { siteTitle, siteDescription, contactWa, contactEmail } = req.body;
        await Setting.findOneAndUpdate({}, {
            siteTitle, siteDescription, contactWa, contactEmail, lastUpdated: new Date()
        }, { upsert: true });
        res.redirect('/admin/settings?msg=Pengaturan disimpan');
    } catch (error) { res.status(500).send(error.message); }
};