const Order = require('../models/Order');
const Cart = require('../models/Cart');
const OrderItemController = require('./OrderItemController'); // handles order items
const db = require('../db');

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

            let totalAmount = 0;
            cartItems.forEach(item => totalAmount += Number(item.price) * item.quantity);

            Order.create(userId, totalAmount, (err2, orderId) => {
                if (err2) return res.status(500).send("Failed to create order");

                const insertItem = (index) => {
                    if (index >= cartItems.length) {
                        Cart.clearCart(userId, () => res.redirect('/invoice/' + orderId));
                        return;
                    }

                    const item = cartItems[index];
                    OrderItemController.create(orderId, item, (err3) => {
                        if (err3) return res.status(500).send("Failed to insert order item");

                        db.query(
                            `UPDATE products SET quantity = quantity - ? WHERE id = ?`, 
                            [item.quantity, item.product_id], 
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

    // Show invoice page
    showInvoice: (req, res) => {
        const orderId = req.params.orderId;

        Order.getById(orderId, (err, order) => {
            if (err || !order) return res.status(404).send('Order not found');

            OrderItemController.getItemsByOrderId(orderId, (err2, items) => {
                if (err2) return res.status(500).send('Failed to get order items');

                res.render('invoice', { 
                    layout: 'layout',       // use layout.ejs
                    title: 'Invoice',       // page title
                    user: req.session.user, // for navbar/footer
                    order, 
                    items 
                });
            });
        });
    },

    // Show purchase history
    history: (req, res) => {
        const user = req.session.user;
        if (!user) return res.redirect('/login');

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


