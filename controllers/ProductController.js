const Product = require('../models/Product');
const path = require('path');

const ProductController = {
    // List all products (admin view)
    list: (req, res) => {
        Product.getAll((err, products) => {
            if (err) return res.status(500).send('Error fetching products.');
            res.render('inventory', {
                layout: 'layout',
                title: 'Inventory',
                products,
                user: req.session.user
            });
        });
    },

    // User shopping list view with pagination + search
    shopping: (req, res) => {
        const rawSearchQuery = (req.query.q || '').trim();
        const searchQuery = rawSearchQuery.toLowerCase();
        const rawCategory = (req.query.category || '').trim();
        const categoryQuery = rawCategory.toLowerCase();
        let page = parseInt(req.query.page, 10) || 1;
        const limit = 4;

        Product.getAll((err, allProducts) => {
            if (err) return res.status(500).send('Error fetching products.');

            const filteredProducts = allProducts.filter(product => {
                const matchesSearch = searchQuery
                    ? (product.productName || '').toLowerCase().includes(searchQuery)
                    : true;
                const matchesCategory = categoryQuery
                    ? (product.category || '').toLowerCase() === categoryQuery
                    : true;
                return matchesSearch && matchesCategory;
            });

            const totalProducts = filteredProducts.length;
            const totalPages = Math.max(1, Math.ceil(totalProducts / limit));

            // Clamp page number so pagination stays in range
            if (page < 1) page = 1;
            if (page > totalPages) page = totalPages;

            const offset = (page - 1) * limit;
            const paginatedProducts = filteredProducts.slice(offset, offset + limit);

            res.render('shopping', {
                layout: 'layout',
                title: 'Shopping',
                products: paginatedProducts,
                user: req.session.user,
                currentPage: page,
                totalPages,
                searchQuery: rawSearchQuery,
                selectedCategory: rawCategory,
                totalProducts
            });
        });
    },

    // Live search API for client-side filtering without reload
    shoppingAPI: (req, res) => {
        const q = (req.query.q || '').toLowerCase();
        Product.getAll((err, allProducts) => {
            if (err) return res.status(500).json({ error: 'Error fetching products.' });
            const filtered = allProducts.filter(p =>
                (p.productName || '').toLowerCase().includes(q)
            );
            res.json(filtered);
        });
    },

    // User search view
    search: (req, res) => {
        const searchQuery = req.query.q ? req.query.q.toLowerCase() : '';
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;

        Product.getAll((err, allProducts) => {
            if (err) return res.status(500).send('Error fetching products.');

            let filteredProducts = allProducts;
            if (searchQuery) {
                filteredProducts = allProducts.filter(p =>
                    p.productName.toLowerCase().includes(searchQuery)
                );
            }

            const totalProducts = filteredProducts.length;
            const totalPages = Math.ceil(totalProducts / limit);
            const paginatedProducts = filteredProducts.slice(offset, offset + limit);

            res.render('shopping', {
                layout: 'layout',
                title: 'Shopping',
                products: paginatedProducts,
                user: req.session.user,
                currentPage: page,
                totalPages: totalPages,
                searchQuery: req.query.q
            });
        });
    },

    // Get single product by ID
    get: (req, res) => {
        const { id } = req.params;
        Product.getById(id, (err, product) => {
            if (err) return res.status(500).send('Error fetching product.');
            if (!product) return res.status(404).send('Product not found.');
            res.render('product', {
                layout: 'layout',
                title: product.productName,
                product,
                user: req.session.user
            });
        });
    },

    // Render form to add a new product
    showAddForm: (req, res) => {
        if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).send('Access denied.');
        res.render('addProduct', { layout: 'layout', title: 'Add Product', user: req.session.user });
    },

    // Add a new product
    add: (req, res) => {
        if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).send('Access denied.');

        const { name, quantity, price, category, origin, description, halal } = req.body;

        const image =
            req.files && req.files.image && req.files.image.length ? req.files.image[0].filename : null;
        const uploadedAdditionalImages =
            req.files && req.files.additionalImages
                ? req.files.additionalImages.map(file => file.filename)
                : [];
        const additionalImages = uploadedAdditionalImages.length
            ? JSON.stringify(uploadedAdditionalImages)
            : null;

        const halalValue = halal === '1' || halal === 'true' || halal === 'on' ? 1 : 0;

        Product.add(
            {
                productName: name,
                quantity,
                price,
                category,
                origin,
                description,
                halal: halalValue,
                image,
                additionalImages
            },
            (err, newProduct) => {
            if (err) {
                console.error(err);
                req.flash('error', 'Failed to add product. Please try again.');
                return res.redirect('/addProduct');
            }
            req.flash('success', 'Product added successfully.');
            res.redirect('/inventory');
            }
        );
    },

    // Render form to update product
    showUpdateForm: (req, res) => {
        if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).send('Access denied.');
        const { id } = req.params;
        Product.getById(id, (err, product) => {
            if (err) return res.status(500).send('Error fetching product.');
            if (!product) return res.status(404).send('Product not found.');
            res.render('updateProduct', { layout: 'layout', title: 'Update Product', product, user: req.session.user });
        });
    },

    // Update product
    update: (req, res) => {
        if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).send('Access denied.');

        const { id } = req.params;
        const {
            name,
            quantity,
            price,
            category,
            origin,
            description,
            halal,
            currentImage,
            existingAdditionalImages,
            removePrimaryImage
        } = req.body;

        const parseImagesArray = raw => {
            if (!raw) return [];
            if (Array.isArray(raw)) return raw.map(img => (img || '').trim()).filter(Boolean);
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed.filter(Boolean);
            } catch (e) {
                // fall back to comma-separated parsing
            }
            return raw
                .split(',')
                .map(img => img.trim())
                .filter(Boolean);
        };

        Product.getById(id, (fetchErr, existingProduct) => {
            if (fetchErr || !existingProduct) {
                console.error(fetchErr);
                req.flash('error', 'Unable to load product for update.');
                return res.redirect('/inventory');
            }

            const safeCurrentImage = currentImage && currentImage !== 'null' ? currentImage : existingProduct.image || null;

            let image = safeCurrentImage;
            if (req.files && req.files.image && req.files.image.length) {
                image = req.files.image[0].filename;
            } else if (removePrimaryImage) {
                image = null;
            }

            // Always trust DB state for existing additional images
            let storedAdditionalImages = parseImagesArray(existingProduct.additionalImages);

            const removalListRaw = req.body.removeAdditionalImages;
            const removalList = Array.isArray(removalListRaw)
                ? removalListRaw
                : removalListRaw
                    ? [removalListRaw]
                    : [];

            const filteredExistingImages = storedAdditionalImages.filter(img => !removalList.includes(img));
            const uploadedAdditionalImages = req.files && req.files.additionalImages ? req.files.additionalImages.map(file => file.filename) : [];
            const mergedAdditionalImages = [...filteredExistingImages, ...uploadedAdditionalImages];

            const halalValue = halal === '1' || halal === 'true' || halal === 'on' ? 1 : 0;

            // If primary image is being removed but additional images exist, promote the first additional as primary
            if (!image && mergedAdditionalImages.length > 0) {
                image = mergedAdditionalImages.shift(); // remove promoted image from additional list
            }

            const additionalImagesValue = mergedAdditionalImages.length ? JSON.stringify(mergedAdditionalImages) : null;

            // Validation: require at least one image (primary or additional)
            if (!image && mergedAdditionalImages.length === 0) {
                req.flash('error', 'At least one product image is required.');
                return res.redirect(`/updateProduct/${id}`);
            }

            Product.update(
                id,
                {
                    productName: name,
                    quantity,
                    price,
                    category,
                    origin,
                    description,
                    halal: halalValue,
                    image,
                    additionalImages: additionalImagesValue
                },
                (err, result) => {
                    if (err) {
                        console.error(err);
                        req.flash('error', 'Failed to update product. Please try again.');
                        return res.redirect(`/updateProduct/${id}`);
                    }
                    req.flash('success', 'Product updated successfully.');
                    res.redirect('/inventory');
                }
            );
        });
    },

    // Delete product
    delete: (req, res) => {
        if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).send('Access denied.');
        const { id } = req.params;
        Product.delete(id, (err, result) => {
            if (err) return res.status(500).send('Error deleting product.');
            res.redirect('/inventory');
        });
    }
};

module.exports = ProductController;
