// Required dependencies
const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Database connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'your_username',
    password: 'your_password',
    database: 'user_management'
});

// Connect to database
db.connect((err) => {
    if (err) throw err;
    console.log('Connected to database');
    
    // Create users table if it doesn't exist
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            phone_number VARCHAR(15) UNIQUE NOT NULL,
            email VARCHAR(100) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `;
    
    db.query(createTableQuery, (err) => {
        if (err) throw err;
        console.log('Users table created or already exists');
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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});