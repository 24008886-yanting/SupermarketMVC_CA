const Cart = require('../models/Cart');

const SHIPPING_THRESHOLD = 60;
const SHIPPING_FEE = 5.9;

const CartController = {
    // View cart
    viewCart: (req, res) => {
        const userId = req.session.user?.user_id;
        if (!userId) return res.redirect('/login');

        Cart.getUserCart(userId, (err, cartItems) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Failed to load cart");
            }

            // Auto-reduce quantities that exceed current stock (only when stock > 0)
            const needsAdjustment = cartItems
                .map(item => {
                    const available = Math.max(0, Number(item.available_quantity) || 0);
                    const requested = Math.max(0, Number(item.quantity) || 0);
                    return { item, available, requested };
                })
                .filter(entry => entry.available > 0 && entry.requested > entry.available);

            if (needsAdjustment.length) {
                const adjustList = needsAdjustment.map(entry => ({
                    cartId: entry.item.cart_id,
                    newQty: entry.available,
                    name: entry.item.productName || entry.item.captured_name || 'Item',
                    prevQty: Math.max(0, Number(entry.item.quantity) || 0),
                    currentStock: entry.available
                }));

                const applyNext = (idx = 0) => {
                    if (idx >= adjustList.length) {
                        const details = adjustList.map(a => 
                            `The quantity of ${a.name} in your cart was reduced from ${a.prevQty} to ${a.newQty} because only ${a.currentStock} is available now. Please review and update the quantity if you want to buy fewer than ${a.newQty}.`
                        );
                        details.forEach(msg => req.flash('success', msg));
                        return res.redirect('/cart');
                    }
                    const adj = adjustList[idx];
                    Cart.updateQuantity(adj.cartId, adj.newQty, (updateErr) => {
                        if (updateErr) {
                            console.error(updateErr);
                        }
                        applyNext(idx + 1);
                    });
                };

                return applyNext(0);
            }

            const enrichedCart = cartItems.map((item) => {
                const productMissing = !item.product_exists;
                const available = productMissing ? 0 : Math.max(0, Number(item.available_quantity) || 0);
                const quantity = Math.max(0, Number(item.quantity) || 0);
                const currentPrice = (item.price === 0 || item.price) ? Number(item.price) : null;
                const capturedPrice = (item.captured_price === 0 || item.captured_price) ? Number(item.captured_price) : null;
                const priceChanged = !productMissing 
                    && currentPrice !== null 
                    && capturedPrice !== null 
                    && Math.abs(currentPrice - capturedPrice) > 0.0001;

                return {
                    ...item,
                    displayName: item.productName || item.captured_name || 'Unavailable product',
                    displayImage: productMissing ? null : item.image,
                    available_quantity: available,
                    isOutOfStock: productMissing || available === 0,
                    exceedsStock: !productMissing && quantity > available,
                    isRemoved: productMissing,
                    capturedPrice,
                    currentPrice,
                    priceChanged,
                    effectivePrice: productMissing ? 0 : (currentPrice !== null ? currentPrice : (capturedPrice || 0))
                };
            });

            const hasOutOfStock = enrichedCart.some(item => item.isOutOfStock);
            const hasStockIssues = enrichedCart.some(item => item.isOutOfStock || item.exceedsStock || item.isRemoved);
            const removedItems = enrichedCart.filter(item => item.isRemoved);
            const priceChangedItems = enrichedCart.filter(item => item.priceChanged && !item.isRemoved);
            const blockCheckout = hasOutOfStock || removedItems.length > 0;
            const subtotal = enrichedCart.reduce((sum, item) => {
                const quantity = Math.max(0, Number(item.quantity) || 0);
                const available = Math.max(0, Number(item.available_quantity) || 0);
                const billableQty = (item.isOutOfStock || item.isRemoved) ? 0 : Math.min(quantity, available);
                const unitPrice = Number(item.effectivePrice) || 0;
                return sum + (billableQty * unitPrice);
            }, 0);
            const shippingFee = subtotal > 0 && subtotal < SHIPPING_THRESHOLD ? SHIPPING_FEE : 0;

            res.render('cart', { 
                layout: 'layout',       // use layout.ejs
                title: 'Your Cart',     // page title for layout
                user: req.session.user, // user info for navbar, footer, etc
                cart: enrichedCart,
                hasOutOfStock,
                hasStockIssues,
                removedItems,
                priceChangedItems,
                blockCheckout,
                cartSummary: {
                    subtotal,
                    shippingFee,
                    total: subtotal + shippingFee,
                    shippingThreshold: SHIPPING_THRESHOLD,
                    shippingBaseFee: SHIPPING_FEE
                }
            });
        });
    },

    // Add item to cart
    addToCart: (req, res) => {
        const userId = req.session.user?.user_id;
        if (!userId) {
            req.flash('error', 'You must log in first.');
            return res.redirect('/login');
        }

        const productId = req.params.product_id;
        const quantity = parseInt(req.body.quantity) || 1;

        Cart.addToCart(userId, productId, quantity, (err) => {
            if (err) {
                console.error(err);
                if (err.code === 'INSUFFICIENT_STOCK') {
                    const itemName = err.productName || 'this item';
                    req.flash('error', `Only ${err.available} of ${itemName} left in stock.`);
                } else {
                    req.flash('error', 'Failed to add item to cart.');
                }
                const fallbackRedirect = req.get('referer') || '/shopping';
                return res.redirect(fallbackRedirect);
            }
            req.flash('success', 'Item added to cart!');
            res.redirect('/shopping');
        });
    },

    // Update cart item quantity
    updateCart: (req, res) => {
        const { cart_id, quantity } = req.body;
        const qty = Math.max(1, parseInt(quantity, 10) || 1);

        Cart.updateQuantity(cart_id, qty, (err) => {
            if (err) {
                console.error(err);
                if (err.code === 'INSUFFICIENT_STOCK') {
                    const itemName = err.productName || 'this item';
                    req.flash('error', `Only ${err.available} of ${itemName} left in stock.`);
                } else if (err.code === 'PRODUCT_REMOVED') {
                    const itemName = err.productName || 'this item';
                    req.flash('error', `${itemName} was removed by admin. Please remove it from your cart.`);
                } else {
                    req.flash('error', 'Failed to update item quantity.');
                }
                return res.redirect('/cart');
            }
            req.flash('success', 'Cart updated.');
            res.redirect('/cart');
        });
    },

    // Delete a cart item
    deleteItem: (req, res) => {
        const { cart_id } = req.body;

        Cart.deleteItem(cart_id, (err) => {
            if (err) {
                console.error(err);
                req.flash('error', 'Failed to remove item from cart.');
                return res.redirect('/cart');
            }
            req.flash('success', 'Item removed from cart.');
            res.redirect('/cart');
        });
    },

    // Clear all items in user's cart
    clearCart: (req, res) => {
        const userId = req.session.user?.user_id;
        if (!userId) return res.redirect('/login');

        Cart.clearCart(userId, (err) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Failed to clear cart");
            }
            res.redirect('/cart');
        });
    },

    // Checkout
    checkout: (req, res) => {
        const userId = req.session.user?.user_id;
        if (!userId) return res.redirect('/login');

        Cart.getUserCart(userId, (err, cartItems) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Checkout failed");
            }

            if (!cartItems.length) {
                req.flash('error', 'Your cart is empty.');
                return res.redirect('/cart');
            }

            // Clear cart after checkout
            Cart.clearCart(userId, (err2) => {
                if (err2) {
                    console.error(err2);
                    return res.status(500).send("Checkout failed");
                }
                req.flash('success', 'Checkout successful!');
                res.redirect('/shopping');
            });
        });
    }
};

module.exports = CartController;
