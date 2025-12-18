// controllers/bannerController.js
const Banner = require('../models/Banner');

exports.listBanners = async (req, res) => {
    try {
        const banners = await Banner.find().sort({ order: 1, createdAt: -1 });
        res.render('admin/banners', { banners });
    } catch (error) {
        res.status(500).send(error.message);
    }
};

exports.createBanner = async (req, res) => {
    try {
        const { title, imageUrl, linkUrl, order, isActive } = req.body;
        await Banner.create({
            title,
            imageUrl,
            linkUrl,
            order: parseInt(order) || 0,
            isActive: isActive === 'on'
        });
        res.redirect('/admin/banners');
    } catch (error) {
        res.status(500).send(error.message);
    }
};

exports.toggleBanner = async (req, res) => {
    try {
        const banner = await Banner.findById(req.params.id);
        if (banner) {
            banner.isActive = !banner.isActive;
            await banner.save();
        }
        res.redirect('/admin/banners');
    } catch (error) {
        res.status(500).send(error.message);
    }
};

exports.deleteBanner = async (req, res) => {
    try {
        await Banner.findByIdAndDelete(req.params.id);
        res.redirect('/admin/banners');
    } catch (error) {
        res.status(500).send(error.message);
    }
};