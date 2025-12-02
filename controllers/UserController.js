const User = require('../models/User');

const UserController = {

    // Render registration form
    showRegisterForm: (req, res) => {
        res.render('register', {
            layout: 'layout',
            title: 'Register',
            messages: [],
            formData: {}
        });
    },



    // Register new user
    register: (req, res) => {
        const { username, email, password, address, contact, role } = req.body;
        const userRole = role || 'user';

        const errors = [];
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;

        if (!username || !email || !password || !address || !contact) {
            errors.push('Please fill all required fields.');
        }

        if (email && !emailPattern.test(email)) {
            errors.push('Please use a valid email (format: name@example.xx).');
        }

        if (password && !passwordPattern.test(password)) {
            errors.push('Password must be at least 10 characters and include letters, numbers, and symbols.');
        }



        if (errors.length > 0) {
            return res.render('register', {
                layout: 'layout',
                title: 'Register',
                messages: errors,
                formData: { username, email, address, contact, role: userRole }
            });
        }



        User.findByEmail(email, (findErr, existingUser) => {

            if (findErr) {
                return res.render('register', {
                    layout: 'layout',
                    title: 'Register',
                    messages: ['Registration failed. Please try again.'],
                    formData: { username, email, address, contact, role: userRole }
                });
            }

            if (existingUser) {
                return res.render('register', {
                    layout: 'layout',
                    title: 'Register',
                    messages: ['This email is already registered. Please use a different email.'],
                    formData: { username, email, address, contact, role: userRole }
                });
            }

            User.register({ username, email, password, address, contact, role: userRole }, (err, newUser) => {

                if (err) {
                    return res.render('register', {
                        layout: 'layout',
                        title: 'Register',
                        messages: ['Registration failed. Please try again.'],
                        formData: { username, email, address, contact, role: userRole }
                    });
                }



                req.flash('success', 'Registration successful! You can now log in.');
                res.redirect('/login');

            });

        });

    },



    // Render login form
    showLoginForm: (req, res) => {
        res.render('login', {
            layout: 'layout',
            title: 'Login',
            errors: req.flash('error') || [],
            messages: req.flash('success') || []
        });
    },



    // Login user
    login: (req, res) => {
        const { email, password } = req.body;
        if (!email || !password) {
            req.flash('error', 'Please enter email and password.');
            return res.redirect('/login');
        }



        User.login(email, password, (err, user) => {
            if (err) {
                req.flash('error', 'Internal server error.');
                return res.redirect('/login');
            }



            if (!user) {
                req.flash('error', 'Invalid email or password.');
                return res.redirect('/login');
            }



            // Set session here
            req.session.user = {
                user_id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            };



            console.log('Session set:', req.session.user);

            req.session.save(err => {
                if (err) return res.send("Error saving session");
                res.redirect('/shopping');
            });
        });
    },



    // Logout user
    logout: (req, res) => {
        req.session.destroy(err => {
            if (err) {
                req.flash('error', 'Error logging out.');
                return res.redirect('/');
            }
            res.redirect('/login');
        });

    },



    // Render user profile
    showProfile: (req, res) => {
        const userId = req.session.user && req.session.user.user_id;
        if (!userId) {
            req.flash('error', 'Please log in to view your profile.');
            return res.redirect('/login');
        }



        User.findById(userId, (err, user) => {
            if (err) {
                req.flash('error', 'Unable to load profile.');
                return res.redirect('/');
            }



            if (!user) {
                req.flash('error', 'User not found.');
                return res.redirect('/logout');
            }



            res.render('profile', {
                layout: 'layout',
                title: 'Profile',
                userData: user,
                errors: res.locals.error || [],
                messages: res.locals.success || []
            });

        });

    },



    // Update user profile
    updateProfile: (req, res) => {
        const userId = req.session.user && req.session.user.user_id;
        if (!userId) {
            req.flash('error', 'Please log in to update your profile.');
            return res.redirect('/login');
        }


        const { username, address, contact, password = '', confirmPassword = '', currentPassword = '' } = req.body;
        const errors = [];
        const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;


        if (!username || !address || !contact) {
            errors.push('Username, address and contact number are required.');
        }



        const trimmedPassword = password.trim();
        const trimmedConfirm = confirmPassword.trim();
        const trimmedCurrentPassword = currentPassword.trim();

        // Only validate strength if user is trying to change password
        if (trimmedPassword || trimmedConfirm) {
            if (!trimmedCurrentPassword) {
                errors.push('Current password is required to set a new password.');
            }
            if (trimmedPassword !== trimmedConfirm) {
                errors.push('Passwords do not match.');
            } else if (!passwordPattern.test(trimmedPassword)) {
                errors.push('Password must be at least 10 characters and include letters, numbers, and symbols.');
            }
        }



        if (errors.length > 0) {
            return User.findById(userId, (err, user) => {
                if (err || !user) {
                    req.flash('error', 'Unable to load profile.');
                    return res.redirect('/profile');
                }



                return res.render('profile', {
                    layout: 'layout',
                    title: 'Profile',
                    userData: {
                        ...user,
                        username,
                        address,
                        contact
                    },

                    errors,
                    messages: []

                });

            });

        }



        const performUpdate = () => {
            User.updateProfile(userId, { username, address, contact, password: trimmedPassword }, (err, updated) => {
                if (err || !updated) {
                    req.flash('error', 'Failed to update profile.');
                    return res.redirect('/profile');
                }



                User.findById(userId, (findErr, updatedUser) => {
                    if (findErr || !updatedUser) {
                        req.flash('error', 'Profile updated but could not reload data.');
                        return res.redirect('/profile');
                    }



                    req.session.user = {
                        user_id: updatedUser.id,
                        username: updatedUser.username,
                        email: updatedUser.email,
                        role: updatedUser.role
                    };



                    req.session.save(() => {
                        req.flash('success', 'Profile updated successfully.');
                        return res.redirect('/profile');
                    });

                });

            });
        };

        // If user is changing password, verify current password first
        if (trimmedPassword) {
            return User.verifyPassword(userId, trimmedCurrentPassword, (err, isValid) => {
                if (err) {
                    req.flash('error', 'Unable to verify current password.');
                    return res.redirect('/profile');
                }
                if (!isValid) {
                    req.flash('error', 'Current password is incorrect.');
                    return res.redirect('/profile');
                }
                return performUpdate();
            });
        }

        return performUpdate();

    }

};



module.exports = UserController;

