const { google } = require('googleapis');
const csv = require('csv-parser');
const stream = require('stream');

exports.syncMembersFromDrive = async (userAccessToken, folderId) => {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: userAccessToken });
    
    const drive = google.drive({ version: 'v3', auth });
    
    // 1. Cari File CSV Terbaru
    const res = await drive.files.list({
        q: `'${folderId}' in parents and mimeType='text/csv' and trashed=false`,
        orderBy: 'createdTime desc',
        pageSize: 1,
        fields: 'files(id, name)'
    });

    if (!res.data.files || res.data.files.length === 0) {
        throw new Error('Tidak ada file CSV ditemukan di folder Drive yang disetting.');
    }

    const fileId = res.data.files[0].id;
    console.log(`Processing CSV: ${res.data.files[0].name}`);

    // 2. Download File
    const result = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
    
    const members = [];
    let groupName = "Unknown Group";
    let isFirstLine = true;

    return new Promise((resolve, reject) => {
        const passThrough = new stream.PassThrough();
        
        // Kita perlu membaca baris pertama manual untuk ambil Nama Grup
        // Lalu sisanya di-pipe ke CSV parser
        
        // Cara simpel: Pipe langsung, tapi kita tangkap event 'data' pertama kali manual?
        // Tidak mudah di stream. Kita pakai cara CSV Parser membaca header.
        
        result.data
            .pipe(csv({ headers: false })) // Baca raw dulu tanpa header otomatis
            .on('data', (row) => {
                // Baris 0: "Anggota grup DATABASE GAME PC Sentral Games"
                if (isFirstLine) {
                    const firstCell = Object.values(row)[0];
                    if (firstCell && firstCell.includes('Anggota grup')) {
                        groupName = firstCell.replace('Anggota grup ', '').trim();
                    } else {
                        groupName = "Imported Group";
                    }
                    isFirstLine = false;
                    return; // Skip baris pertama
                }

                // Baris 1: Header kolom (Alamat email, dll) -> Skip juga
                const col0 = Object.values(row)[0];
                if (col0 === 'Alamat email') return;

                // Baris Data
                const email = row[0]; // Kolom A
                const name = row[1];  // Kolom B
                const role = row[2];  // Kolom C
                
                // Tanggal Join: Kolom G(6), H(7), I(8)
                let joinDate = null;
                if (row[6] && row[7] && row[8]) {
                    joinDate = new Date(row[6], row[7] - 1, row[8]);
                }

                if (email && email.includes('@')) {
                    members.push({
                        email: email.trim(),
                        name: name ? name.trim() : '',
                        role: role,
                        status: 'active',
                        groupName: groupName, // Masukkan nama grup
                        joinDate: joinDate,
                        lastSync: new Date()
                    });
                }
            })
            .on('end', () => {
                resolve({ members, groupName });
            })
            .on('error', reject);
    });
};