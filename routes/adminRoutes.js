const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const bannerController = require('../controllers/bannerController');
const memberController = require('../controllers/memberController');
const driveLogController = require('../controllers/driveLogController');
const { ensureAuth } = require('../config/passport');
const driveFileService = require('../services/driveFileService');

router.use(ensureAuth);

// Hubs
router.get('/dashboard', adminController.dashboard);
router.get('/database', adminController.databaseHub);
router.get('/system', adminController.systemHub);

// Drives Management
router.get('/drives', adminController.listDrives);
router.post('/drives', adminController.createDrive); // RUTE BARU: Tambah Database
router.delete('/drives/:id', adminController.deleteDrive); // RUTE BARU: Hapus Database
router.get('/drive-logs', driveLogController.listLogs);

// Members & Logs
router.get('/members', memberController.listMembers);
router.post('/members/sync-direct', memberController.syncDirectGroup);
router.get('/members/export-logs', memberController.exportGroupLogs);
router.get('/activity-logs', memberController.listActivityLogs);

// Settings & Banners
router.get('/settings', adminController.settings);
router.post('/settings', adminController.updateSettings);
router.get('/banners', bannerController.listBanners);
router.post('/banners', bannerController.createBanner);
router.post('/banners/:id/toggle', bannerController.toggleBanner);
router.delete('/banners/:id', bannerController.deleteBanner);

// Sync API
router.post('/sync/:id', async (req, res) => {
    try {
        const result = await driveFileService.syncFiles(req.user.accessToken, req.params.id);
        res.json({ status: 'success', data: result });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

module.exports = router;