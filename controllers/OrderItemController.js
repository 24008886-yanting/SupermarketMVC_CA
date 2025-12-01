const OrderItem = require('../models/OrderItem');

const OrderItemController = {
    create: (orderId, item, callback) => {
        OrderItem.create(orderId, item, callback);
    },
    getItemsByOrderId: (orderId, callback) => {
        OrderItem.getByOrderId(orderId, (err, items) => {
            if (err) return callback(err);

            const formattedItems = items.map(item => ({
                ...item, 
                price: parseFloat(item.price) || 0,
                quantity: parseInt(item.quantity) || 0
            })); 
            callback(null, formattedItems);
        });
    }
};

module.exports = OrderItemController;
