const db = require('../db');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;
const isSha1Hash = (hash) => /^[a-f0-9]{40}$/i.test(hash || '');

const User = {
    // Register new user
    register: ({ username, email, password, address, contact, role }, callback) => {
        const allowedRoles = ['user', 'admin']; // whitelist roles; defaults to user
        const sanitizedRole = allowedRoles.includes(role) ? role : 'user';
        const normalizedEmail = email.trim().toLowerCase();

        const checkSql = 'SELECT id FROM users WHERE email = ? LIMIT 1';
        db.query(checkSql, [normalizedEmail], (checkErr, rows) => {
            if (checkErr) return callback(checkErr, null);
            if (rows.length) return callback(new Error('EMAIL_EXISTS'), null);

            bcrypt.hash(password, SALT_ROUNDS, (hashErr, hashedPassword) => {
                if (hashErr) return callback(hashErr, null);

                const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, ?, ?, ?, ?)';
                db.query(sql, [username, normalizedEmail, hashedPassword, address, contact, sanitizedRole], (err, result) => {
                    if (err) return callback(err, null);
                    callback(null, { user_id: result.insertId, username, email: normalizedEmail, address, contact, role: sanitizedRole });
                });
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

            const storedHash = user.password || '';

            // Prefer bcrypt comparison; fall back to legacy SHA-1 and upgrade on success
            bcrypt.compare(password, storedHash, (bcryptErr, isMatch) => {
                if (bcryptErr) return callback(bcryptErr, null);
                if (isMatch) return callback(null, user);

                // Legacy SHA-1 path
                if (!isSha1Hash(storedHash)) return callback(null, null);

                const sha1Input = crypto.createHash('sha1').update(password).digest('hex');
                if (sha1Input !== storedHash) return callback(null, null);

                // Upgrade to bcrypt after a successful legacy check
                bcrypt.hash(password, SALT_ROUNDS, (hashErr, newHash) => {
                    if (hashErr) return callback(null, user); // allow login even if upgrade fails
                    db.query('UPDATE users SET password = ? WHERE id = ?', [newHash, user.id], () => callback(null, user));
                });
            });
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

            const storedHash = results[0].password || '';

            bcrypt.compare(password, storedHash, (bcryptErr, isMatch) => {
                if (bcryptErr) return callback(bcryptErr, null);
                if (isMatch) return callback(null, true);

                // Legacy SHA-1 fallback
                if (!isSha1Hash(storedHash)) return callback(null, false);
                const sha1Input = crypto.createHash('sha1').update(password).digest('hex');
                if (sha1Input !== storedHash) return callback(null, false);

                // Upgrade to bcrypt after successful legacy match
                bcrypt.hash(password, SALT_ROUNDS, (hashErr, newHash) => {
                    if (!hashErr) {
                        db.query('UPDATE users SET password = ? WHERE id = ?', [newHash, id], () => callback(null, true));
                    } else {
                        callback(null, true); // consider it valid even if upgrade fails
                    }
                });
            });
        });
    },

    // Update user profile (password optional)
    updateProfile: (id, { username, address, contact, password }, callback) => {
        const values = [username, address, contact];
        let sql = 'UPDATE users SET username = ?, address = ?, contact = ?';

        const runUpdate = (maybeHashedPassword) => {
            const finalValues = [...values];
            let finalSql = sql;

            if (maybeHashedPassword) {
                finalSql += ', password = ?';
                finalValues.push(maybeHashedPassword);
            }

            finalSql += ' WHERE id = ?';
            finalValues.push(id);

            db.query(finalSql, finalValues, (err, result) => {
                if (err) return callback(err, null);
                callback(null, result.affectedRows > 0);
            });
        };

        if (!password) {
            return runUpdate(null);
        }

        bcrypt.hash(password, SALT_ROUNDS, (hashErr, hashedPassword) => {
            if (hashErr) return callback(hashErr, null);
            runUpdate(hashedPassword);
        });
    },
};

module.exports = User;
