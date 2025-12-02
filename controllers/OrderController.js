const Order = require('../models/Order');
const Cart = require('../models/Cart');
const OrderItemController = require('./OrderItemController'); // handles order items
const db = require('../db');

const SHIPPING_THRESHOLD = 60;
const SHIPPING_FEE = 5.9;
const computeOrderTotals = (items, storedTotal, storedShippingFee) => {
    const subtotal = (items || []).reduce((sum, item) => {
        const price = (item.price === 0 || item.price) ? Number(item.price)
            : (item.captured_price === 0 || item.captured_price) ? Number(item.captured_price)
            : 0;
        const qty = Math.max(0, Number(item.quantity) || 0);
        return sum + (price * qty);
    }, 0);

    const parsedTotal = parseFloat(storedTotal);
    const totalFromDb = Number.isNaN(parsedTotal) ? null : parsedTotal;
    const parsedShipping = parseFloat(storedShippingFee);
    const shippingFromDb = Number.isNaN(parsedShipping) ? null : parsedShipping;
    const computedShipping = subtotal > 0 && subtotal < SHIPPING_THRESHOLD ? SHIPPING_FEE : 0;
    const shippingFee = shippingFromDb !== null 
        ? shippingFromDb 
        : (totalFromDb !== null ? Math.max(0, totalFromDb - subtotal) : computedShipping);
    const total = totalFromDb !== null ? totalFromDb : subtotal + shippingFee;

    return { subtotal, shippingFee, total };
};

const OrderController = {

    // Checkout: create order + order items + update stock + redirect to invoice
    checkout: (req, res) => {
        const user = req.session.user;
        if (!user) return res.redirect('/login');
        const userId = user.user_id;

        Cart.getUserCart(userId, (err, cartItems) => {
            if (err) return res.status(500).send("Failed to get cart items");
            if (!cartItems.length) return res.redirect('/cart');

            const removedItems = cartItems.filter(item => !item.product_exists);
            if (removedItems.length) {
                const names = removedItems.map(item => item.captured_name || item.productName || 'an item').join(', ');
                req.flash('error', `Some items were removed by admin: ${names}. Please remove them from your cart before checkout.`);
                return res.redirect('/cart');
            }

            const stockIssues = cartItems.filter((item) => {
                const requestedQty = Math.max(0, Number(item.quantity) || 0);
                const availableQty = Math.max(0, Number(item.available_quantity ?? item.stock_quantity) || 0);
                return availableQty === 0 || requestedQty > availableQty;
            });

            if (stockIssues.length) {
                const names = stockIssues.map(item => item.productName).join(', ');
                req.flash('error', `Some items are out of stock or exceed available quantity: ${names}. Please update your cart.`);
                return res.redirect('/cart');
            }

            let subtotal = 0;
            cartItems.forEach((item) => {
                const price = (item.price === 0 || item.price) ? Number(item.price) 
                    : (item.captured_price === 0 || item.captured_price) ? Number(item.captured_price) 
                    : 0;
                const qty = Math.max(0, Number(item.quantity) || 0);
                subtotal += price * qty;
            });

            const shippingFee = subtotal > 0 && subtotal < SHIPPING_THRESHOLD ? SHIPPING_FEE : 0;
            const totalAmount = subtotal + shippingFee;

            Order.create(userId, totalAmount, shippingFee, (err2, orderId) => {
                if (err2) return res.status(500).send("Failed to create order");

                const insertItem = (index) => {
                    if (index >= cartItems.length) {
                        Cart.clearCart(userId, () => res.redirect('/invoice/' + orderId));
                        return;
                    }

                    const item = cartItems[index];
                    const priceToCharge = (item.price === 0 || item.price) ? Number(item.price)
                        : (item.captured_price === 0 || item.captured_price) ? Number(item.captured_price)
                        : 0;
                    const quantityToCharge = Math.max(0, Number(item.quantity) || 0);
                    const orderItemPayload = { ...item, price: priceToCharge, quantity: quantityToCharge };

                    OrderItemController.create(orderId, orderItemPayload, (err3) => {
                        if (err3) return res.status(500).send("Failed to insert order item");

                        db.query(
                            `UPDATE products SET quantity = quantity - ? WHERE id = ?`, 
                            [quantityToCharge, item.product_id], 
                            (err4) => {
                                if (err4) return res.status(500).send("Failed to update product stock");
                                insertItem(index + 1);
                            }
                        );
                    });
                };

                insertItem(0);
            });
        });
    },

    // Show invoice page (only owner or admin)
    showInvoice: (req, res) => {
        const orderId = req.params.orderId;
        const user = req.session.user;
        if (!user) return res.redirect('/login');

        Order.getById(orderId, (err, order) => {
            if (err || !order) return res.status(404).send('Order not found');

            // Enforce ownership unless user is admin
            const isAdmin = user.role === 'admin';
            if (!isAdmin && Number(order.user_id) !== Number(user.user_id)) {
                req.flash('error', 'You do not have access to this invoice.');
                return res.redirect('/purchases');
            }

            OrderItemController.getItemsByOrderId(orderId, (err2, items) => {
                if (err2) return res.status(500).send('Failed to get order items');

                res.render('invoice', { 
                    layout: 'layout',       // use layout.ejs
                    title: 'Invoice',       // page title
                    user,                   // for navbar/footer
                    order, 
                    items,
                    orderSummary: computeOrderTotals(items, order.total_amount, order.shipping_fee),
                    shippingThreshold: SHIPPING_THRESHOLD,
                    shippingBaseFee: SHIPPING_FEE
                });
            });
        });
    },

    // Show purchase history (normal users only)
    history: (req, res) => {
        const user = req.session.user;
        if (!user) return res.redirect('/login');
        if (user.role === 'admin') {
            req.flash('error', 'Admins do not have a personal purchase history.');
            return res.redirect('/order-dashboard');
        }

        Order.getByUserId(user.user_id, (err, orders) => {
            if (err) return res.status(500).send('Failed to fetch order history');
            if (!orders.length) return res.render('purchases', { 
                layout: 'layout',
                title: 'My Purchases',
                user,
                orders: [] 
            });

            let completed = 0;
            orders.forEach((order) => {
                OrderItemController.getItemsByOrderId(order.order_id, (err2, items) => {
                    if (err2) return res.status(500).send('Failed to fetch order items');
                    order.items = items;
                    order.summary = computeOrderTotals(items, order.total_amount, order.shipping_fee);
                    completed++;
                    if (completed === orders.length) {
                        res.render('purchases', { 
                            layout: 'layout',
                            title: 'My Purchases',
                            user,
                            orders 
                        });
                    }
                });
            });
        });
    },

    // Admin dashboard to view all orders
    adminDashboard: (req, res) => {
        Order.getAllWithUsers((err, orders) => {
            if (err) return res.status(500).send('Failed to fetch orders');

            if (!orders.length) {
                return res.render('orderDashboard', { 
                    layout: 'layout',
                    title: 'Order Dashboard',
                    user: req.session.user,
                    orders: [] 
                });
            }

            let completed = 0;
            orders.forEach((order) => {
                OrderItemController.getItemsByOrderId(order.order_id, (err2, items) => {
                    if (err2) return res.status(500).send('Failed to fetch order items');
                    order.items = items || [];
                    order.summary = computeOrderTotals(order.items, order.total_amount, order.shipping_fee);
                    completed++;
                    if (completed === orders.length) {
                        res.render('orderDashboard', { 
                            layout: 'layout',
                            title: 'Order Dashboard',
                            user: req.session.user,
                            orders 
                        });
                    }
                });
            });
        });
    }

};

module.exports = OrderController;


