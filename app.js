// Express app setup and route wiring for the supermarket platform
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const multer = require('multer');
const app = express();
const expressLayouts = require('express-ejs-layouts');

const { checkAuthenticated, checkAuthorised } = require('./middleware');
const Product = require('./models/Product');


app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layout'); // layout.ejs in views folder
// automatically wraps all pages with views/layout.ejs


const ProductController = require('./controllers/ProductController');
const UserController = require('./controllers/UserController');
const CartController = require('./controllers/CartController');
const OrderController = require('./controllers/OrderController');


const PORT = 3000;


// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'supersecretkey',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 2 * 60 * 60 * 1000 }
}));

app.use(flash());


// Multer setup for file uploads (product images)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images/');
    },

    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage });



// Middleware to make session available in views and preload categories for the navbar
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.error = req.flash('error');
    res.locals.success = req.flash('success');
    Product.getDistinctCategories((err, categories) => {
        res.locals.categories = err ? [] : categories;
        next();
    });

});



// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));




// -------------------- ROUTES -------------------- //



// -------- USER ROUTES -------- //



// Registration
app.get('/register', UserController.showRegisterForm);
app.post('/register', UserController.register);



// Login / Logout
app.get('/login', UserController.showLoginForm);
app.post('/login', UserController.login);
app.get('/logout', UserController.logout);



// Profile
app.get('/profile', checkAuthenticated, UserController.showProfile);
app.post('/profile', checkAuthenticated, UserController.updateProfile);



// Admin-only user management
// app.get('/users', UserController.listUsers);
// app.get('/users/:user_id', UserController.getUserById);



// -------- PRODUCT ROUTES -------- //



// Admin inventory
app.get('/inventory', checkAuthenticated, checkAuthorised(['admin']), ProductController.list);

// Admin management
app.get('/admin/manage-admin', checkAuthenticated, checkAuthorised(['admin']), UserController.showAdminRegistrationForm);
app.post('/admin/manage-admin', checkAuthenticated, checkAuthorised(['admin']), UserController.createAdmin);



// User shopping list
app.get('/shopping', checkAuthenticated, ProductController.shopping);

// Live search API
app.get('/shopping-api', checkAuthenticated, ProductController.shoppingAPI);



// Product details
app.get('/product/:id', checkAuthenticated, ProductController.get); // match EJS link



// Add product
app.get('/addProduct', checkAuthenticated, checkAuthorised(['admin']), ProductController.showAddForm);

app.post(
    '/addProduct',
    checkAuthenticated,
    checkAuthorised(['admin']),
    upload.fields([
        { name: 'image', maxCount: 1 },
        { name: 'additionalImages', maxCount: 5 }
    ]),
    ProductController.add
);



// Update product
app.get('/updateProduct/:id', checkAuthenticated, checkAuthorised(['admin']), ProductController.showUpdateForm);

app.post('/updateProduct/:id', checkAuthenticated, checkAuthorised(['admin']), upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'additionalImages', maxCount: 5 }
]), ProductController.update);



// Delete product
app.get('/deleteProduct/:id', checkAuthenticated, checkAuthorised(['admin']), ProductController.delete);





// Home page (redirect based on role)

app.get('/', (req, res) => {
    if (req.session.user) {
        return res.redirect('/shopping');
    } else {
        res.redirect('/login');
    }
});



// -------- CART ROUTES -------- //



// View cart
app.get('/cart',checkAuthenticated, CartController.viewCart);



// Add item to cart
app.post('/add-to-cart/:product_id',checkAuthenticated, CartController.addToCart);



// Update quantity
app.post('/cart/update',checkAuthenticated, CartController.updateCart);



// Delete item
app.post('/cart/delete',checkAuthenticated, CartController.deleteItem);



// Clear all items in cart
app.post('/cart/clear', checkAuthenticated, CartController.clearCart);



// Checkout now goes to OrderController instead of CartController
app.post('/cart/checkout', checkAuthenticated, OrderController.checkout);



// -------- ORDER ROUTES -------- //
app.get('/invoice/:orderId',checkAuthenticated, OrderController.showInvoice);
app.get('/order-dashboard', checkAuthenticated, checkAuthorised(['admin']), OrderController.adminDashboard);



// -------- PURCHASE HISTORY -------- //
app.get('/purchases',checkAuthenticated, OrderController.history);



// -------- ERROR HANDLING -------- //

// 404
app.use((req, res, next) => {
    res.status(404).send("404 - Page Not Found");
});



// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
