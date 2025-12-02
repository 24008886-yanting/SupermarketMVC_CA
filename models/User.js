const db = require('../db');
const crypto = require('crypto');

const User = {
    // Register new user (optional: hash with SHA-1 if registering new)
    register: ({ username, email, password, address, contact, role }, callback) => {
        const normalizedEmail = email.trim().toLowerCase();
        const hashedPassword = crypto.createHash('sha1').update(password).digest('hex');

        const checkSql = 'SELECT id FROM users WHERE email = ? LIMIT 1';
        db.query(checkSql, [normalizedEmail], (checkErr, rows) => {
            if (checkErr) return callback(checkErr, null);
            if (rows.length) return callback(new Error('EMAIL_EXISTS'), null);

            const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, ?, ?, ?, ?)';
            db.query(sql, [username, normalizedEmail, hashedPassword, address, contact, role], (err, result) => {
                if (err) return callback(err, null);
                callback(null, { user_id: result.insertId, username, email: normalizedEmail, address, contact, role });
            });
        });
    },

    // Login user
    login: (email, password, callback) => {
        const normalizedEmail = email.trim().toLowerCase();
        const sql = 'SELECT * FROM users WHERE email = ?';
        db.query(sql, [normalizedEmail], (err, results) => {
            if (err) return callback(err, null);

            const user = results[0];
            if (!user) return callback(null, null);

            // Hash the input password with SHA-1
            const hashedInput = crypto.createHash('sha1').update(password).digest('hex');

            if (hashedInput !== user.password) {
                return callback(null, null); // password does not match
            }

            callback(null, user); // successful login
        });
    },

    findByEmail: (email, callback) => {
        const normalizedEmail = email.trim().toLowerCase();
        const sql = 'SELECT id, username, email, address, contact, role FROM users WHERE email = ? LIMIT 1';
        db.query(sql, [normalizedEmail], (err, results) => {
            if (err) return callback(err, null);
            if (results.length === 0) return callback(null, null);
            callback(null, results[0]);
        });
    },

    // Find user by ID
    findById: (id, callback) => {
        const sql = 'SELECT id, username, email, address, contact, role FROM users WHERE id = ?';
        db.query(sql, [id], (err, results) => {
            if (err) return callback(err, null);
            if (results.length === 0) return callback(null, null);
            callback(null, results[0]);
        });
    },

    // Verify a user's password by ID
    verifyPassword: (id, password, callback) => {
        const sql = 'SELECT password FROM users WHERE id = ?';
        db.query(sql, [id], (err, results) => {
            if (err) return callback(err, null);
            if (results.length === 0) return callback(null, false);

            const storedHash = results[0].password;
            const hashedInput = crypto.createHash('sha1').update(password).digest('hex');
            callback(null, hashedInput === storedHash);
        });
    },

    // Update user profile (password optional)
    updateProfile: (id, { username, address, contact, password }, callback) => {
        const values = [username, address, contact];
        let sql = 'UPDATE users SET username = ?, address = ?, contact = ?';

        if (password) {
            const hashedPassword = crypto.createHash('sha1').update(password).digest('hex');
            sql += ', password = ?';
            values.push(hashedPassword);
        }

        sql += ' WHERE id = ?';
        values.push(id);

        db.query(sql, values, (err, result) => {
            if (err) return callback(err, null);
            callback(null, result.affectedRows > 0);
        });
    },
};

module.exports = User;
