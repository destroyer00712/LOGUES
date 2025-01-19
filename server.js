// Load environment variables
require('dotenv').config();

const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Database connection using environment variables
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'your_username',
    password: process.env.DB_PASSWORD || 'your_password',
    database: process.env.DB_NAME || 'user_management'
});

// Connect to database
db.connect((err) => {
    if (err) throw err;
    console.log('Connected to database');
    
    // Create users table
    const createUsersTable = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            phone_number VARCHAR(15) UNIQUE NOT NULL,
            email VARCHAR(100) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `;
    
    db.query(createUsersTable, (err) => {
        if (err) throw err;
        console.log('Users table created or already exists');
    });

    // Create vouchers table
    const createVoucherTable = `
        CREATE TABLE IF NOT EXISTS vouchers (
            id VARCHAR(50) PRIMARY KEY,
            timestamp BIGINT NOT NULL,
            user_number VARCHAR(15) NOT NULL UNIQUE,
            status ENUM('redeemed', 'not_redeemed') DEFAULT 'not_redeemed',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_number) REFERENCES users(phone_number)
        )
    `;
    
    db.query(createVoucherTable, (err) => {
        if (err) throw err;
        console.log('Vouchers table created or already exists');
    });
});

// Validate phone number format
function isValidPhoneNumber(phone) {
    const phoneRegex = /^\+?[\d\s-]{10,}$/;
    return phoneRegex.test(phone);
}

// Validate email format
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// USER APIS

// CREATE - Add new user
app.post('/api/users', (req, res) => {
    const { name, phone_number, email } = req.body;

    // Validate required fields
    if (!name || !phone_number || !email) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate phone number and email format
    if (!isValidPhoneNumber(phone_number)) {
        return res.status(400).json({ error: 'Invalid phone number format' });
    }
    if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    const query = 'INSERT INTO users (name, phone_number, email) VALUES (?, ?, ?)';
    db.query(query, [name, phone_number, email], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ error: 'Phone number already exists' });
            }
            return res.status(500).json({ error: 'Database error' });
        }
        res.status(201).json({
            message: 'User created successfully',
            userId: result.insertId
        });
    });
});

// READ - Get all users
app.get('/api/users', (req, res) => {
    const query = 'SELECT * FROM users';
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// READ - Get user by phone number
app.get('/api/users/:phone', (req, res) => {
    const phone_number = req.params.phone;
    const query = 'SELECT * FROM users WHERE phone_number = ?';
    
    db.query(query, [phone_number], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(results[0]);
    });
});

// UPDATE - Update user by phone number
app.put('/api/users/:phone', (req, res) => {
    const phone_number = req.params.phone;
    const { name, email } = req.body;

    // Validate required fields
    if (!name || !email) {
        return res.status(400).json({ error: 'Name and email are required' });
    }

    // Validate email format
    if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    const query = 'UPDATE users SET name = ?, email = ? WHERE phone_number = ?';
    db.query(query, [name, email, phone_number], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ message: 'User updated successfully' });
    });
});

// DELETE - Delete user by phone number
app.delete('/api/users/:phone', (req, res) => {
    const phone_number = req.params.phone;

    // First check if user has any vouchers
    db.query('SELECT * FROM vouchers WHERE user_number = ?', [phone_number], (err, vouchers) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (vouchers.length > 0) {
            return res.status(400).json({ error: 'Cannot delete user with active vouchers' });
        }

        const query = 'DELETE FROM users WHERE phone_number = ?';
        db.query(query, [phone_number], (err, result) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            res.json({ message: 'User deleted successfully' });
        });
    });
});

// VOUCHER APIS

// Generate unique voucher ID
function generateVoucherId() {
    const now = new Date();
    const timestamp = now.getTime(); // Get timestamp in milliseconds
    const dateStr = now.toISOString().slice(0,10).replace(/-/g, '');
    return `LG${dateStr}${timestamp}`;
}

// CREATE - Generate new voucher
app.post('/api/vouchers', (req, res) => {
    const { user_number } = req.body;

    if (!user_number) {
        return res.status(400).json({ error: 'User number is required' });
    }

    // Check if user exists and doesn't already have a voucher
    db.query('SELECT * FROM users WHERE phone_number = ?', [user_number], (err, users) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if user already has a voucher
        db.query('SELECT * FROM vouchers WHERE user_number = ?', [user_number], (err, vouchers) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            if (vouchers.length > 0) {
                return res.status(400).json({ 
                    error: 'User already has a voucher',
                    existing_voucher: vouchers[0]
                });
            }

            const timestamp = Date.now();
            const voucherId = generateVoucherId();

            const query = 'INSERT INTO vouchers (id, timestamp, user_number) VALUES (?, ?, ?)';
            db.query(query, [voucherId, timestamp, user_number], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Failed to create voucher' });
                }
                res.status(201).json({
                    message: 'Voucher created successfully',
                    voucher: {
                        id: voucherId,
                        timestamp,
                        user_number,
                        status: 'not_redeemed'
                    }
                });
            });
        });
    });
});

// READ - Get all vouchers
app.get('/api/vouchers', (req, res) => {
    const query = 'SELECT * FROM vouchers';
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// READ - Get voucher by ID
app.get('/api/vouchers/:id', (req, res) => {
    const voucherId = req.params.id;
    const query = 'SELECT * FROM vouchers WHERE id = ?';
    
    db.query(query, [voucherId], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: 'Voucher not found' });
        }
        res.json(results[0]);
    });
});

// UPDATE - Redeem voucher
app.put('/api/vouchers/:id/redeem', (req, res) => {
    const voucherId = req.params.id;
    
    // First check if voucher exists and is not already redeemed
    db.query('SELECT * FROM vouchers WHERE id = ?', [voucherId], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: 'Voucher not found' });
        }
        if (results[0].status === 'redeemed') {
            return res.status(400).json({ error: 'Voucher already redeemed' });
        }

        // Update voucher status to redeemed
        const query = 'UPDATE vouchers SET status = "redeemed" WHERE id = ?';
        db.query(query, [voucherId], (err, result) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to redeem voucher' });
            }
            res.json({ message: 'Voucher redeemed successfully' });
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});