const db = require('../db');

const Order = {
    create: (userId, totalAmount, shippingFee, callback) => {
        const fee = (shippingFee === 0 || shippingFee) ? shippingFee : 0;
        const sql = `INSERT INTO orders (user_id, total_amount, shipping_fee, status) VALUES (?, ?, ?, ?)`;
        db.query(sql, [userId, totalAmount, fee, 'Pending'], (err, result) => {
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

    getAllWithUsers: (filters, callback) => {
        // Allow calling with only a callback
        if (typeof filters === 'function') {
            callback = filters;
            filters = {};
        }

        const { startDate, endDate } = filters || {};
        const clauses = [];
        const params = [];

        if (startDate) {
            clauses.push(`DATE(o.created_at) >= ?`);
            params.push(startDate);
        }
        if (endDate) {
            clauses.push(`DATE(o.created_at) <= ?`);
            params.push(endDate);
        }

        let sql = `
            SELECT 
                o.*, 
                u.email, 
                u.address, 
                u.username
            FROM orders o
            JOIN users u ON o.user_id = u.id
        `;

        if (clauses.length) {
            sql += ` WHERE ` + clauses.join(' AND ');
        }

        sql += ` ORDER BY o.created_at DESC`;

        db.query(sql, params, (err, results) => {
            if (err) return callback(err);
            callback(null, results);
        });
    }
};

module.exports = Order;
