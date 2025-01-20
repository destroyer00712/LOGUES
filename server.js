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
            CREATE TABLE vouchers (
                voucher_id VARCHAR(50) PRIMARY KEY,
                user_number VARCHAR(15),
                timestamp BIGINT NOT NULL,
                status ENUM('redeemed', 'not_redeemed') DEFAULT 'not_redeemed',
                FOREIGN KEY (user_number) REFERENCES users(phone_number) ON DELETE CASCADE
            ) ENGINE=InnoDB;`;

        const createDealerTable = `
        CREATE TABLE IF NOT EXISTS dealers (
            dealer_number VARCHAR(15) PRIMARY KEY,
            password VARCHAR(100) NOT NULL,
            dealer_name VARCHAR(100) NOT NULL,
            dealer_pincode VARCHAR(10) NOT NULL,
            redeemed_vouchers JSON DEFAULT ('[]')
        )
    `;

    const createDistributorTable = `
        CREATE TABLE IF NOT EXISTS distributors (
            distributor_number VARCHAR(15) PRIMARY KEY,
            password VARCHAR(100) NOT NULL,
            distributor_name VARCHAR(100) NOT NULL,
            distributor_pincode VARCHAR(10) NOT NULL,
            dealers JSON DEFAULT ('[]')
        )
    `;

    db.query(createDistributorTable, (err) => {
        if (err) {
            console.error('Error creating distributors table:', err);
        } else {
            console.log('Distributors table created successfully');
        }
    });

    // Modify dealers table to include distributor reference
    const alterDealersTable = `
        ALTER TABLE dealers 
        ADD COLUMN distributor_number VARCHAR(15),
        ADD FOREIGN KEY (distributor_number) REFERENCES distributors(distributor_number)
    `;

    db.query(alterDealersTable, (err) => {
        if (err) {
            console.error('Error altering dealers table:', err);
        } else {
            console.log('Dealers table altered successfully');
        }
    });
        
    db.query(createDealerTable, (err) => {
        if (err) {
            console.error('Error creating dealers table:', err);
        } else {
            console.log('Dealers table created successfully');
        }
    });

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

    console.log('Creating voucher for user:', user_number);

    // Check if user exists
    db.query('SELECT * FROM users WHERE phone_number = ?', [user_number], (err, results) => {
        if (err) {
            console.error('Error checking user existence:', err);
            return res.status(500).json({ 
                error: 'Database error',
                details: err.message
            });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if user already has a voucher
        db.query('SELECT * FROM vouchers WHERE user_number = ?', [user_number], (err, voucherResults) => {
            if (err) {
                console.error('Error checking existing voucher:', err);
                return res.status(500).json({ 
                    error: 'Database error',
                    details: err.message
                });
            }

            if (voucherResults.length > 0) {
                return res.status(409).json({ error: 'User already has a voucher' });
            }

            const timestamp = Date.now();
            const voucher_id = `LG${timestamp}`;

            console.log('Generating new voucher:', {
                voucher_id,
                user_number,
                timestamp
            });

            const query = 'INSERT INTO vouchers (voucher_id, user_number, timestamp, status) VALUES (?, ?, ?, ?)';
            db.query(query, [voucher_id, user_number, timestamp, 'not_redeemed'], (err, result) => {
                if (err) {
                    console.error('Error inserting voucher:', err);
                    return res.status(500).json({ 
                        error: 'Database error',
                        details: err.message
                    });
                }
                
                res.status(201).json({ 
                    message: 'Voucher created successfully',
                    voucher_id,
                    timestamp,
                    status: 'not_redeemed'
                });
            });
        });
    });
});

// Also let's verify if the vouchers table exists
db.query(`
    SHOW TABLES LIKE 'vouchers'
`, (err, results) => {
    if (err) {
        console.error('Error checking vouchers table:', err);
    } else {
        if (results.length === 0) {
            // Create vouchers table if it doesn't exist
            const createVoucherTable = `
                CREATE TABLE IF NOT EXISTS vouchers (
                    voucher_id VARCHAR(50) PRIMARY KEY,
                    user_number VARCHAR(15),
                    timestamp BIGINT NOT NULL,
                    status ENUM('redeemed', 'not_redeemed') DEFAULT 'not_redeemed',
                    FOREIGN KEY (user_number) REFERENCES users(phone_number)
                )
            `;
            
            db.query(createVoucherTable, (err) => {
                if (err) {
                    console.error('Error creating vouchers table:', err);
                } else {
                    console.log('Vouchers table created successfully');
                }
            });
        } else {
            console.log('Vouchers table exists');
        }
    }
});

// Get vouchers endpoint with error logging
app.get('/api/vouchers', (req, res) => {
    db.query('SELECT * FROM vouchers', (err, results) => {
        if (err) {
            console.error('Error fetching vouchers:', err);
            return res.status(500).json({ 
                error: 'Database error',
                details: err.message
            });
        }
        res.json(results);
    });
});

// Redeem voucher endpoint with error logging
// Modify the existing voucher redemption endpoint to include dealer information
app.patch('/api/vouchers/:voucher_id/redeem', (req, res) => {
    const { dealer_number } = req.body;
    
    if (!dealer_number) {
        return res.status(400).json({ error: 'Dealer number is required' });
    }

    // Start a transaction
    db.beginTransaction((err) => {
        if (err) {
            console.error('Error starting transaction:', err);
            return res.status(500).json({ error: 'Database error', details: err.message });
        }

        // First check and update voucher status
        const updateVoucherQuery = 'UPDATE vouchers SET status = "redeemed" WHERE voucher_id = ? AND status = "not_redeemed"';
        db.query(updateVoucherQuery, [req.params.voucher_id], (err, voucherResult) => {
            if (err) {
                return db.rollback(() => {
                    console.error('Error updating voucher:', err);
                    res.status(500).json({ error: 'Database error', details: err.message });
                });
            }

            if (voucherResult.affectedRows === 0) {
                return db.rollback(() => {
                    res.status(400).json({ error: 'Voucher not found or already redeemed' });
                });
            }

            // Get existing redeemed vouchers for dealer
            const getDealerQuery = 'SELECT redeemed_vouchers FROM dealers WHERE dealer_number = ?';
            db.query(getDealerQuery, [dealer_number], (err, dealerResults) => {
                if (err) {
                    return db.rollback(() => {
                        console.error('Error fetching dealer:', err);
                        res.status(500).json({ error: 'Database error', details: err.message });
                    });
                }

                if (dealerResults.length === 0) {
                    return db.rollback(() => {
                        res.status(404).json({ error: 'Dealer not found' });
                    });
                }

                // Update dealer's redeemed vouchers
                const redeemedVouchers = JSON.parse(dealerResults[0].redeemed_vouchers);
                redeemedVouchers.push({
                    voucher_id: req.params.voucher_id,
                    redeemed_at: new Date().toISOString()
                });

                const updateDealerQuery = 'UPDATE dealers SET redeemed_vouchers = ? WHERE dealer_number = ?';
                db.query(updateDealerQuery, [JSON.stringify(redeemedVouchers), dealer_number], (err) => {
                    if (err) {
                        return db.rollback(() => {
                            console.error('Error updating dealer vouchers:', err);
                            res.status(500).json({ error: 'Database error', details: err.message });
                        });
                    }

                    // Commit the transaction
                    db.commit((err) => {
                        if (err) {
                            return db.rollback(() => {
                                console.error('Error committing transaction:', err);
                                res.status(500).json({ error: 'Database error', details: err.message });
                            });
                        }
                        res.json({ 
                            message: 'Voucher redeemed successfully',
                            voucher_id: req.params.voucher_id,
                            dealer_number: dealer_number
                        });
                    });
                });
            });
        });
    });
});

//Dealer endpoints
app.post('/api/dealers', (req, res) => {
    const { dealer_number, password, dealer_name, dealer_pincode, distributor_number } = req.body;
    
    if (!dealer_number || !password || !dealer_name || !dealer_pincode || !distributor_number) {
        return res.status(400).json({ error: 'All fields are required, including distributor_number' });
    }

    // Start a transaction
    db.beginTransaction((err) => {
        if (err) {
            console.error('Error starting transaction:', err);
            return res.status(500).json({ error: 'Database error', details: err.message });
        }

        // First check if distributor exists
        db.query('SELECT * FROM distributors WHERE distributor_number = ?', [distributor_number], (err, distributorResults) => {
            if (err) {
                return db.rollback(() => {
                    console.error('Error checking distributor:', err);
                    res.status(500).json({ error: 'Database error', details: err.message });
                });
            }

            if (distributorResults.length === 0) {
                return db.rollback(() => {
                    res.status(404).json({ error: 'Distributor not found' });
                });
            }

            // Create dealer
            const createDealerQuery = 'INSERT INTO dealers (dealer_number, password, dealer_name, dealer_pincode, redeemed_vouchers, distributor_number) VALUES (?, ?, ?, ?, ?, ?)';
            db.query(createDealerQuery, [dealer_number, password, dealer_name, dealer_pincode, '[]', distributor_number], (err, dealerResult) => {
                if (err) {
                    return db.rollback(() => {
                        console.error('Error creating dealer:', err);
                        if (err.code === 'ER_DUP_ENTRY') {
                            res.status(409).json({ error: 'Dealer number already exists' });
                        } else {
                            res.status(500).json({ error: 'Database error', details: err.message });
                        }
                    });
                }

                // Update distributor's dealers JSON
                const dealers = JSON.parse(distributorResults[0].dealers || '[]');
                dealers.push({
                    dealer_number,
                    dealer_name,
                    dealer_pincode,
                    created_at: new Date().toISOString()
                });

                const updateDistributorQuery = 'UPDATE distributors SET dealers = ? WHERE distributor_number = ?';
                db.query(updateDistributorQuery, [JSON.stringify(dealers), distributor_number], (err) => {
                    if (err) {
                        return db.rollback(() => {
                            console.error('Error updating distributor dealers:', err);
                            res.status(500).json({ error: 'Database error', details: err.message });
                        });
                    }

                    // Commit the transaction
                    db.commit((err) => {
                        if (err) {
                            return db.rollback(() => {
                                console.error('Error committing transaction:', err);
                                res.status(500).json({ error: 'Database error', details: err.message });
                            });
                        }
                        res.status(201).json({ 
                            message: 'Dealer created successfully and added to distributor',
                            dealer_number,
                            distributor_number
                        });
                    });
                });
            });
        });
    });
});


// Dealer login
app.post('/api/dealers/login', (req, res) => {
    const { dealer_number, password } = req.body;
    
    if (!dealer_number || !password) {
        return res.status(400).json({ error: 'Dealer number and password are required' });
    }

    const query = 'SELECT dealer_number, dealer_name, dealer_pincode FROM dealers WHERE dealer_number = ? AND password = ?';
    db.query(query, [dealer_number, password], (err, results) => {
        if (err) {
            console.error('Error during login:', err);
            return res.status(500).json({ error: 'Database error', details: err.message });
        }
        
        if (results.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        res.json({
            message: 'Login successful',
            dealer: results[0]
        });
    });
});

// Get dealer details
app.get('/api/dealers/:dealer_number', (req, res) => {
    const query = 'SELECT dealer_number, dealer_name, dealer_pincode, redeemed_vouchers FROM dealers WHERE dealer_number = ?';
    db.query(query, [req.params.dealer_number], (err, results) => {
        if (err) {
            console.error('Error fetching dealer:', err);
            return res.status(500).json({ error: 'Database error', details: err.message });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: 'Dealer not found' });
        }
        res.json(results[0]);
    });
});

// Create distributor
app.post('/api/distributors', (req, res) => {
    const { distributor_number, password, distributor_name, distributor_pincode } = req.body;
    
    if (!distributor_number || !password || !distributor_name || !distributor_pincode) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const query = 'INSERT INTO distributors (distributor_number, password, distributor_name, distributor_pincode, dealers) VALUES (?, ?, ?, ?, ?)';
    db.query(query, [distributor_number, password, distributor_name, distributor_pincode, '[]'], (err, result) => {
        if (err) {
            console.error('Error creating distributor:', err);
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ error: 'Distributor number already exists' });
            }
            return res.status(500).json({ error: 'Database error', details: err.message });
        }
        res.status(201).json({ message: 'Distributor created successfully' });
    });
});

// Distributor login
app.post('/api/distributors/login', (req, res) => {
    const { distributor_number, password } = req.body;
    
    if (!distributor_number || !password) {
        return res.status(400).json({ error: 'Distributor number and password are required' });
    }

    const query = 'SELECT distributor_number, distributor_name, distributor_pincode FROM distributors WHERE distributor_number = ? AND password = ?';
    db.query(query, [distributor_number, password], (err, results) => {
        if (err) {
            console.error('Error during login:', err);
            return res.status(500).json({ error: 'Database error', details: err.message });
        }
        
        if (results.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        res.json({
            message: 'Login successful',
            distributor: results[0]
        });
    });
});

// Get distributor details with all dealers
app.get('/api/distributors/:distributor_number', (req, res) => {
    const query = 'SELECT distributor_number, distributor_name, distributor_pincode, dealers FROM distributors WHERE distributor_number = ?';
    db.query(query, [req.params.distributor_number], (err, results) => {
        if (err) {
            console.error('Error fetching distributor:', err);
            return res.status(500).json({ error: 'Database error', details: err.message });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: 'Distributor not found' });
        }
        res.json(results[0]);
    });
});



const PORT = process.env.PORT || 1346;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});