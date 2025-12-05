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
    },

    getMonthlyStats: (startDate, endDate, callback) => {
        const sql = `
            SELECT 
                COALESCE(SUM(total_amount), 0) AS total_revenue,
                COUNT(*) AS total_orders
            FROM orders
            WHERE DATE(created_at) BETWEEN ? AND ?
        `;

        db.query(sql, [startDate, endDate], (err, results) => {
            if (err) return callback(err);
            const row = results && results[0] ? results[0] : {};
            callback(null, {
                totalRevenue: Number(row.total_revenue) || 0,
                totalOrders: Number(row.total_orders) || 0
            });
        });
    },

    getMonthlyBestSellers: (startDate, endDate, limit = 3, callback) => {
        const sql = `
            SELECT 
                oi.product_id,
                oi.product_name,
                SUM(oi.quantity) AS total_quantity,
                SUM(oi.subtotal) AS total_revenue
            FROM order_items oi
            JOIN orders o ON o.order_id = oi.order_id
            WHERE DATE(o.created_at) BETWEEN ? AND ?
            GROUP BY oi.product_id, oi.product_name
            ORDER BY total_quantity DESC, total_revenue DESC
            LIMIT ?
        `;

        db.query(sql, [startDate, endDate, limit], (err, results) => {
            if (err) return callback(err);
            callback(null, results || []);
        });
    }
};

module.exports = Order;
