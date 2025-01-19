// server.js
const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Database connection
const db = mysql.createConnection({
    host: process.env.HOST || 'localhost',
    user: process.env.USERNAME || 'admin_namansetty',
    password: process.env.PASSWORD || 'Ashagana@014',
    database: process.env.DB_NAME || 'admin_LOGUES'
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to database:', err);
        return;
    }
    console.log('Connected to database');

    // Create tables if they don't exist
    const createUserTable = `
        CREATE TABLE IF NOT EXISTS users (
            phone_number VARCHAR(15) PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL
        )`;

    const createVoucherTable = `
        CREATE TABLE IF NOT EXISTS vouchers (
            voucher_id VARCHAR(50) PRIMARY KEY,
            user_number VARCHAR(15) UNIQUE,
            timestamp BIGINT NOT NULL,
            status ENUM('redeemed', 'not_redeemed') DEFAULT 'not_redeemed',
            FOREIGN KEY (user_number) REFERENCES users(phone_number)
        )`;

    db.query(createUserTable, (err) => {
        if (err) console.error('Error creating users table:', err);
    });

    db.query(createVoucherTable, (err) => {
        if (err) console.error('Error creating vouchers table:', err);
    });
});

// User APIs
app.post('/api/users', (req, res) => {
    const { name, phone_number, email } = req.body;
    
    if (!name || !phone_number || !email) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const query = 'INSERT INTO users (name, phone_number, email) VALUES (?, ?, ?)';
    db.query(query, [name, phone_number, email], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ error: 'Phone number already exists' });
            }
            return res.status(500).json({ error: 'Database error' });
        }
        res.status(201).json({ message: 'User created successfully' });
    });
});

app.get('/api/users', (req, res) => {
    db.query('SELECT * FROM users', (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

app.get('/api/users/:phone_number', (req, res) => {
    const query = 'SELECT * FROM users WHERE phone_number = ?';
    db.query(query, [req.params.phone_number], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (results.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(results[0]);
    });
});

// Voucher APIs
app.post('/api/vouchers', (req, res) => {
    const { user_number } = req.body;
    
    if (!user_number) {
        return res.status(400).json({ error: 'User number is required' });
    }

    // Check if user exists
    db.query('SELECT * FROM users WHERE phone_number = ?', [user_number], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (results.length === 0) return res.status(404).json({ error: 'User not found' });

        // Check if user already has a voucher
        db.query('SELECT * FROM vouchers WHERE user_number = ?', [user_number], (err, voucherResults) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (voucherResults.length > 0) {
                return res.status(409).json({ error: 'User already has a voucher' });
            }

            const timestamp = Date.now();
            const voucher_id = `LG${timestamp}`;

            const query = 'INSERT INTO vouchers (voucher_id, user_number, timestamp, status) VALUES (?, ?, ?, ?)';
            db.query(query, [voucher_id, user_number, timestamp, 'not_redeemed'], (err, result) => {
                if (err) return res.status(500).json({ error: 'Database error' });
                res.status(201).json({ 
                    message: 'Voucher created successfully',
                    voucher_id,
                    timestamp
                });
            });
        });
    });
});

app.get('/api/vouchers', (req, res) => {
    db.query('SELECT * FROM vouchers', (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

app.patch('/api/vouchers/:voucher_id/redeem', (req, res) => {
    const query = 'UPDATE vouchers SET status = "redeemed" WHERE voucher_id = ? AND status = "not_redeemed"';
    db.query(query, [req.params.voucher_id], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (result.affectedRows === 0) {
            return res.status(400).json({ error: 'Voucher not found or already redeemed' });
        }
        res.json({ message: 'Voucher redeemed successfully' });
    });
});

const PORT = process.env.PORT || 1346;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});