const db = require('../db');

const Order = {
    create: (userId, totalAmount, callback) => {
        const sql = `INSERT INTO orders (user_id, total_amount, status) VALUES (?, ?, ?)`;
        db.query(sql, [userId, totalAmount, 'Pending'], (err, result) => {
            if (err) return callback(err);
            callback(null, result.insertId);
        });
    },

    getById: (orderId, callback) => {
        const sql = `SELECT * FROM orders WHERE order_id = ?`;
        db.query(sql, [orderId], (err, results) => {
            if (err) return callback(err);
            callback(null, results[0]);
        });
    },

    getByUserId: (userId, callback) => {
        const sql = `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`;
        db.query(sql, [userId], (err, results) => {
            if (err) return callback(err);
            callback(null, results);
        });
    },

    getAllWithUsers: (callback) => {
        const sql = `
            SELECT 
                o.*, 
                u.email, 
                u.address, 
                u.username
            FROM orders o
            JOIN users u ON o.user_id = u.id
            ORDER BY o.created_at DESC
        `;
        db.query(sql, (err, results) => {
            if (err) return callback(err);
            callback(null, results);
        });
    }
};

module.exports = Order;
