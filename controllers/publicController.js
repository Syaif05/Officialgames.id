const Drive = require('../models/Drive');
const Banner = require('../models/Banner');
const getFileModel = require('../models/File');

exports.home = async (req, res) => {
    try {
        const drives = await Drive.find({}).sort({ name: 1 });
        const banners = await Banner.find({ isActive: true }).sort({ order: 1 });
        
        res.render('home', { 
            page: 'home', 
            drives, 
            banners 
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Terjadi kesalahan pada server: " + error.message);
    }
};

exports.viewDrive = async (req, res) => {
    try {
        const drive = await Drive.findOne({ slug: req.params.slug });
        if (!drive) return res.status(404).send("Database tidak ditemukan");

        const collectionName = `files_${drive.slug.replace(/-/g, '_')}`;
        const File = getFileModel(collectionName);

        const currentFolderId = req.query.folder || drive.rootFolderId;
        const searchQuery = req.query.q || '';
        const page = parseInt(req.query.page) || 1;
        
        // UBAH LIMIT JADI 30 (Angka Ajaib: Habis dibagi 2, 3, 5, 6)
        const limit = 30; 
        const skip = (page - 1) * limit;

        let matchStage = {};

        if (searchQuery) {
            matchStage = { 
                name: { $regex: searchQuery, $options: 'i' },
                driveId: { $ne: null } 
            };
        } else {
            matchStage = { 
                parents: currentFolderId 
            };
        }

        const pipeline = [
            { $match: matchStage },
            {
                $addFields: {
                    isFolder: {
                        $cond: {
                            if: { $eq: ["$mimeType", "application/vnd.google-apps.folder"] },
                            then: 1, 
                            else: 0  
                        }
                    }
                }
            },
            {
                $sort: { 
                    isFolder: -1, 
                    name: 1      
                }
            },
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    data: [{ $skip: skip }, { $limit: limit }]
                }
            }
        ];

        const result = await File.aggregate(pipeline);
        
        const files = result[0].data;
        const totalFiles = result[0].metadata[0] ? result[0].metadata[0].total : 0;

        let currentFolderName = drive.name;
        let backLink = null;
        
        if (!searchQuery && currentFolderId !== drive.rootFolderId) {
            const folderInfo = await File.findOne({ driveId: currentFolderId });
            if (folderInfo) {
                currentFolderName = folderInfo.name;
                backLink = folderInfo.parents[0];
            } else {
                backLink = drive.rootFolderId;
            }
        }

        res.render('public-view', { 
            page: 'view',
            drive, 
            files, 
            currentFolderName, 
            backLink, 
            currentFolderId,
            searchQuery,
            pagination: { page, total: Math.ceil(totalFiles / limit) },
            formatBytes: (bytes) => {
                if (!+bytes) return '-';
                const k = 1024; const i = Math.floor(Math.log(bytes) / Math.log(k));
                return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${['B', 'KB', 'MB', 'GB'][i]}`;
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Gagal memuat database: " + error.message);
    }
};