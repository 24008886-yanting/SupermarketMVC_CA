const db = require('../db');

const OrderItem = {
    create: (orderId, item, callback) => {
        const sql = `INSERT INTO order_items 
            (order_id, product_id, product_name, quantity, price, subtotal) 
            VALUES (?, ?, ?, ?, ?, ?)`;
        const values = [
            orderId,
            item.product_id,
            item.productName,
            item.quantity,
            item.price,
            item.price * item.quantity
        ];
        db.query(sql, values, callback);
    },

    getByOrderId: (orderId, callback) => {
        const sql = `SELECT * FROM order_items WHERE order_id = ?`;
        db.query(sql, [orderId], callback);
    }
};

module.exports = OrderItem;