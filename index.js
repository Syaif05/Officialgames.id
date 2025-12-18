require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const getFileModel = require('./models/File');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error(err));

const verifyKey = (req, res, next) => {
    const key = req.headers['x-api-key'];
    if (key !== process.env.API_SECRET_KEY) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    next();
};

app.post('/api/bulk-write', verifyKey, async (req, res) => {
    try {
        const { collection, operations } = req.body;
        if (!collection || !operations) return res.status(400).send('Missing data');

        const FileModel = getFileModel(collection);
        const result = await FileModel.bulkWrite(operations);
        
        res.json({ success: true, result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/drop-collection', verifyKey, async (req, res) => {
    try {
        const { collection } = req.body;
        const FileModel = getFileModel(collection);
        await FileModel.collection.drop();
        res.json({ success: true, message: 'Collection dropped' });
    } catch (error) {
        res.json({ success: false, message: error.message }); 
    }
});

app.get('/', (req, res) => res.send('Sync API Running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));