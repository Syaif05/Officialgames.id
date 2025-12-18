const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // Kita tambahkan Opsi 'family: 4' untuk memaksa IPv4
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            family: 4, // PENTING: Paksa IPv4 untuk menghindari ETIMEOUT
            serverSelectionTimeoutMS: 5000, // Timeout 5 detik saja biar gak nunggu lama
            socketTimeoutMS: 45000,
        });
        
        console.log(`✅ MongoDB Atlas Connected: ${conn.connection.host}`);
    } catch (err) {
        console.error("❌ Gagal Konek Database (Timeout/Network Error)");
        console.error("Saran: Periksa internet atau ganti DNS laptop ke 8.8.8.8");
        console.error("Error Detail:", err.message);
        process.exit(1);
    }
};

module.exports = connectDB;