require("dotenv").config();
const mysql = require("mysql2");
const fs = require("fs");
const bcrypt = require("bcrypt");

// ✅ Load CA Certificate for SSL (Aiven MySQL requires it)
const caCert = fs.readFileSync("./ca.pem");

// ✅ Create MySQL Connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT, // Make sure this is set in your .env
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl: {
        ca: caCert
    }
});

// ✅ Connect to MySQL
db.connect((err) => {
    if (err) {
        console.error("❌ Database connection failed:", err.message);
        process.exit(1);
    }
    console.log("✅ Connected to MySQL Database.");
    addAdmin(adminName, adminEmail, adminPassword); // Call after connection
});

// ✅ Function to Add Admin
async function addAdmin(name, email, password) {
    try {
        const hashedPassword = await bcrypt.hash(password, 10); // Hash password
        const sql = "INSERT INTO admins (name, email, password) VALUES (?, ?, ?)";
        db.query(sql, [name, email, hashedPassword], (err, result) => {
            if (err) {
                console.error("❌ Error inserting admin:", err.message);
            } else {
                console.log("✅ Admin added successfully!");
            }
            db.end(); // Close connection
        });
    } catch (error) {
        console.error("❌ Error hashing password:", error.message);
        db.end();
    }
}

// ✅ Example Usage
const adminName = "Admin User";
const adminEmail = "admin@gmail.com";
const adminPassword = "admin";
