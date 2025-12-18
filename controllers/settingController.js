const Setting = require('../models/Setting');

exports.getSettings = async (req, res) => {
    try {
        let setting = await Setting.findOne();
        if (!setting) setting = await Setting.create({});
        res.render('admin/settings', { setting });
    } catch (error) {
        res.status(500).send(error.message);
    }
};

exports.updateSettings = async (req, res) => {
    try {
        // Tambahkan memberFolderId di sini
        const { logoUrl, shopeeUrl, lynkUrl, waNumber, heroTitle, heroSubtitle, memberFolderId } = req.body;
        
        let setting = await Setting.findOne();
        if (!setting) {
            await Setting.create(req.body);
        } else {
            setting.logoUrl = logoUrl;
            setting.shopeeUrl = shopeeUrl;
            setting.lynkUrl = lynkUrl;
            setting.waNumber = waNumber;
            setting.heroTitle = heroTitle;
            setting.heroSubtitle = heroSubtitle;
            setting.memberFolderId = memberFolderId; // Simpan ID Folder
            await setting.save();
        }
        res.redirect('/admin/settings');
    } catch (error) {
        res.status(500).send(error.message);
    }
};