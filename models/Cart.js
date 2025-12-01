const db = require('../db');

const Cart = {
    // Get user's cart with product details, preserving items whose products were deleted
    getUserCart: (userId, callback) => {
        const sql = `
            SELECT 
                c.cart_id,
                c.product_id,
                c.quantity,
                c.captured_name,
                c.captured_price,
                p.id AS product_exists,
                p.productName,
                p.price,
                p.image,
                COALESCE(GREATEST(p.quantity, 0), 0) AS available_quantity,
                p.quantity AS stock_quantity,
                CASE WHEN p.id IS NULL OR p.quantity <= 0 THEN 1 ELSE 0 END AS is_out_of_stock
            FROM cart c
            LEFT JOIN products p ON c.product_id = p.id
            WHERE c.user_id = ?`;
        db.query(sql, [userId], (err, results) => {
            if (err) return callback(err, null);
            callback(null, results);
        });
    },

    // Add item to cart (or increment quantity)
    addToCart: (userId, productId, qty, callback) => {
        const requestedQty = Math.max(1, parseInt(qty, 10) || 1);
        const productSql = `SELECT quantity, productName, price FROM products WHERE id = ?`;

        db.query(productSql, [productId], (err, productRows) => {
            if (err) return callback(err);
            if (!productRows.length) return callback(new Error('Product not found'));

            const availableQty = Number(productRows[0].quantity) || 0;
            const productName = productRows[0].productName || 'product';
            const currentPrice = Number(productRows[0].price) || 0;

            const checkSql = `SELECT quantity, captured_name, captured_price FROM cart WHERE user_id = ? AND product_id = ?`;
            db.query(checkSql, [userId, productId], (err2, results) => {
                if (err2) return callback(err2);

                const currentQty = results.length > 0 ? Number(results[0].quantity) || 0 : 0;
                const newQty = currentQty + requestedQty;

                if (newQty > availableQty) {
                    const stockErr = new Error('Insufficient stock');
                    stockErr.code = 'INSUFFICIENT_STOCK';
                    stockErr.available = availableQty;
                    stockErr.productName = productName;
                    return callback(stockErr);
                }

                if (results.length > 0) {
                    const updateSql = `
                        UPDATE cart 
                        SET quantity = ?, 
                            captured_name = COALESCE(captured_name, ?), 
                            captured_price = COALESCE(captured_price, ?)
                        WHERE user_id = ? AND product_id = ?`;
                    db.query(updateSql, [newQty, productName, currentPrice, userId, productId], (err3) => {
                        if (err3) return callback(err3);
                        callback(null, true);
                    });
                } else {
                    const insertSql = `
                        INSERT INTO cart (user_id, product_id, quantity, captured_name, captured_price) 
                        VALUES (?, ?, ?, ?, ?)`;
                    db.query(insertSql, [userId, productId, requestedQty, productName, currentPrice], (err4) => {
                        if (err4) return callback(err4);
                        callback(null, true);
                    });
                }
            });
        });
    },

    // Update cart item quantity
    updateQuantity: (cartId, qty, callback) => {
        const desiredQty = Math.max(1, parseInt(qty, 10) || 1);
        const fetchSql = `
            SELECT 
                c.product_id, 
                c.captured_name,
                p.quantity AS available_quantity, 
                p.productName
            FROM cart c
            LEFT JOIN products p ON c.product_id = p.id
            WHERE c.cart_id = ?
        `;

        db.query(fetchSql, [cartId], (err, rows) => {
            if (err) return callback(err);
            if (!rows.length) return callback(new Error('Cart item not found'));

            const productMissing = rows[0].available_quantity === null || typeof rows[0].available_quantity === 'undefined';
            if (productMissing) {
                const missingErr = new Error('Product removed');
                missingErr.code = 'PRODUCT_REMOVED';
                missingErr.productName = rows[0].captured_name || rows[0].productName || 'product';
                return callback(missingErr);
            }

            const availableQty = Number(rows[0].available_quantity) || 0;
            if (desiredQty > availableQty) {
                const stockErr = new Error('Insufficient stock');
                stockErr.code = 'INSUFFICIENT_STOCK';
                stockErr.available = availableQty;
                stockErr.productName = rows[0].productName || 'product';
                return callback(stockErr);
            }

            const sql = `UPDATE cart SET quantity = ? WHERE cart_id = ?`;
            db.query(sql, [desiredQty, cartId], (err2) => {
                if (err2) return callback(err2);
                callback(null, true);
            });
        });
    },

    // Delete cart item
    deleteItem: (cartId, callback) => {
        const sql = `DELETE FROM cart WHERE cart_id = ?`;
        db.query(sql, [cartId], (err) => {
            if (err) return callback(err);
            callback(null, true);
        });
    },

    // Clear all items for a user
    clearCart: (userId, callback) => {
        const sql = `DELETE FROM cart WHERE user_id = ?`;
        db.query(sql, [userId], (err, result) => {
            if (err) return callback(err);
            callback(null, result);
        });
    }
};

module.exports = Cart;
