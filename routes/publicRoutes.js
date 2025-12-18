const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');

router.get('/', publicController.home);
router.get('/view/:slug', publicController.viewDrive);

module.exports = router;