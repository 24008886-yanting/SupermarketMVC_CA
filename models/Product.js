const db = require('../db');

const Product = {
    getAll: (callback) => {
        const sql = 'SELECT * FROM products';
        db.query(sql, (err, results) => {
            if (err) return callback(err, null);
            callback(null, results);
        });
    },

    getById: (id, callback) => {
        const sql = 'SELECT * FROM products WHERE id = ?';
        db.query(sql, [id], (err, results) => {
            if (err) return callback(err, null);
            callback(null, results[0]);
        });
    },

    getByName: (searchTerm, callback) => {
        const sql = "SELECT * FROM products WHERE productName LIKE ?";
        db.query(sql, [`%${searchTerm}%`], (err, results) => {
            if (err) return callback(err, null);
            callback(null, results);
        });
    },

    getDistinctCategories: callback => {
        const sql = 'SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category <> "" ORDER BY category';
        db.query(sql, (err, results) => {
            if (err) return callback(err, null);
            const categories = results.map(row => row.category);
            callback(null, categories);
        });
    },

    add: (productData, callback) => {
        const { productName, quantity, price, category, origin, description, halal, image, additionalImages } = productData;
        const sql = 'INSERT INTO products (productName, quantity, price, category, origin, description, halal, image, additionalImages) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
        db.query(
            sql,
            [
                productName,
                quantity,
                price,
                category || null,
                origin || null,
                description || null,
                typeof halal === 'undefined' ? 0 : halal,
                image,
                additionalImages || null
            ],
            (err, result) => {
                if (err) return callback(err, null);
                callback(null, { id: result.insertId, ...productData });
            }
        );
    },

    update: (id, productData, callback) => {
        const { productName, quantity, price, category, origin, description, halal, image, additionalImages } = productData;
        const sql = 'UPDATE products SET productName = ?, quantity = ?, price = ?, category = ?, origin = ?, description = ?, halal = ?, image = ?, additionalImages = ? WHERE id = ?';
        db.query(
            sql,
            [
                productName,
                quantity,
                price,
                category || null,
                origin || null,
                description || null,
                typeof halal === 'undefined' ? 0 : halal,
                image,
                additionalImages || null,
                id
            ],
            (err, result) => {
                if (err) return callback(err, null);
                callback(null, result);
            }
        );
    },

    delete: (id, callback) => {
        const sql = 'DELETE FROM products WHERE id = ?';
        db.query(sql, [id], (err, result) => {
            if (err) return callback(err, null);
            callback(null, result);
        });
    }
};

module.exports = Product;
