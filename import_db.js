const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function importDatabase() {
    console.log("Aiven Cloud DB-তে কানেক্ট হচ্ছে...");
    
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'mysql-16255d48-arif201572061-7ffb.i.aivencloud.com',
        port: process.env.DB_PORT || 17398,
        user: process.env.DB_USER || 'avnadmin',
        password: process.env.DB_PASSWORD || 'AVNS_ogsR5bmiKOPK1m7QZFg',
        database: process.env.DB_NAME || 'defaultdb',
        ssl: { rejectUnauthorized: false },
        multipleStatements: true
    });

    console.log("ডাটাবেজ কানেক্ট হয়েছে! SQL ফাইল লোড করা হচ্ছে...");
    const sqlPath = path.join(__dirname, 'friends_corporation_utf8_fixed.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log("Aiven ক্লাউড ডাটাবেজে ডাটা ইমপোর্ট করা হচ্ছে...");
    await connection.query(sql);
    console.log("✅ সফলভাবে সব ডাটা ও অ্যাকাউন্ট Aiven DB-তে আপডেট হয়েছে!");
    
    await connection.end();
}

importDatabase().catch(err => {
    console.error("❌ ইমপোর্ট করতে সমস্যা হয়েছে:", err.message);
});