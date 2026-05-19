const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const dotenv = require('dotenv');
const auth = require('../middleware/auth');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
dotenv.config();
// ==============================
// EMAIL TRANSPORTER
// ==============================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      subscription_status: user.subscription_status,
      plan_type: user.plan_type,
      subscription_expiry: user.subscription_expiry,
      cancel_at_expiry: user.cancel_at_expiry,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// ===== REGISTER USER =====
router.post('/register', async (req, res) => {
  try {
   const { full_name, email, phone, password } = req.body;

const cleanPassword = String(password || '').trim();

    if (!full_name || !email || !cleanPassword) {
      return res.status(400).json({
        message: 'Full name, email, and password are required.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (!emailRegex.test(normalizedEmail)) {
  return res.status(400).json({
    message: 'Please enter a valid email address.',
  });
}

const commonEmailMistakes = [
  'gmail.coma',
  'gmail.con',
  'gmail.co',
  'gmai.com',
  'gmial.com',
  'yahoo.coma',
  'hotmail.coma',
  'outlook.coma',
];

const emailDomain = normalizedEmail.split('@')[1];

if (commonEmailMistakes.includes(emailDomain)) {
  return res.status(400).json({
    message: 'Please check your email address. Did you mean gmail.com?',
  });
}
if (cleanPassword.length < 6) {
  return res.status(400).json({
    message: 'Password must be at least 6 characters.',
  });
}
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(cleanPassword, salt);

    const newUser = new User({
      full_name: full_name.trim(),
      email: normalizedEmail,
      phone: phone?.trim() || '',
      password: hashedPassword,
    });

    await newUser.save();

    const token = generateToken(newUser);

    res.status(201).json({
      message: 'User registered successfully!',
      token,
      user: {
        id: newUser._id,
        full_name: newUser.full_name,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
        subscription_status: newUser.subscription_status,
        plan_type: newUser.plan_type,
        subscription_start: newUser.subscription_start,
        subscription_expiry: newUser.subscription_expiry,
        cancel_at_expiry: newUser.cancel_at_expiry,
      },
    });
  } catch (error) {
    console.error('REGISTER ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== LOGIN USER =====
router.post('/login', async (req, res) => {
  try {
   const { email, password } = req.body;

const cleanPassword = String(password || '').trim();

   if (!email || !cleanPassword) {
      return res.status(400).json({
        message: 'Email and password are required.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

   const isMatch = await bcrypt.compare(cleanPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    const token = generateToken(user);

    res.json({
      message: 'Login successful!',
      token,
      user: {
        id: user._id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        subscription_status: user.subscription_status,
        plan_type: user.plan_type,
        subscription_start: user.subscription_start,
        subscription_expiry: user.subscription_expiry,
        cancel_at_expiry: user.cancel_at_expiry,
      },
    });
  } catch (error) {
    console.error('LOGIN ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== CHANGE PASSWORD =====
router.post('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
const cleanCurrentPassword = String(currentPassword || '').trim();
const cleanNewPassword = String(newPassword || '').trim();

   if (!cleanCurrentPassword || !cleanNewPassword) {
      return res.status(400).json({ message: 'All fields required' });
    }
if (cleanNewPassword.length < 6) {
  return res.status(400).json({
    message: 'Password must be at least 6 characters',
  });
}
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

   const isMatch = await bcrypt.compare(cleanCurrentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
   user.password = await bcrypt.hash(cleanNewPassword, salt);

    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('CHANGE PASSWORD ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/update-profile', auth, async (req, res) => {
  try {
    const { full_name, email } = req.body;

    if (!full_name || !email) {
      return res.status(400).json({
        message: 'Full name and email are required',
      });
    }

    const trimmedName = full_name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        message: 'Please enter a valid email address',
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const LIMIT = 3;
    const WINDOW_DAYS = 30;
    const now = new Date();

    if (!user.profile_update_window_start) {
      user.profile_update_window_start = now;
      user.profile_update_count = 0;
    }

    const diffDays =
      (now - new Date(user.profile_update_window_start)) /
      (1000 * 60 * 60 * 24);

    if (diffDays > WINDOW_DAYS) {
      user.profile_update_window_start = now;
      user.profile_update_count = 0;
    }

    if (
      user.full_name === trimmedName &&
      user.email === normalizedEmail
    ) {
      return res.json({ message: 'No changes detected' });
    }

    if (user.profile_update_count >= LIMIT) {
      return res.status(429).json({
        message: `You can only update your profile ${LIMIT} times every ${WINDOW_DAYS} days.`,
      });
    }

    const existingEmailUser = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: user._id },
    });

    if (existingEmailUser) {
      return res.status(400).json({
        message: 'Email is already in use by another account',
      });
    }

    user.full_name = trimmedName;
    user.email = normalizedEmail;
    user.profile_update_count += 1;

    await user.save();

    const token = generateToken(user);

    return res.json({
      success: true,
      message: `Profile updated (${user.profile_update_count}/${LIMIT})`,
      token,
      user: {
        id: user._id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        subscription_status: user.subscription_status,
        plan_type: user.plan_type,
        subscription_start: user.subscription_start,
        subscription_expiry: user.subscription_expiry,
        cancel_at_expiry: user.cancel_at_expiry,
        profile_update_count: user.profile_update_count,
        profile_update_window_start: user.profile_update_window_start,
      },
    });
  } catch (err) {
    console.error('UPDATE PROFILE ERROR:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});
// ===== FORGOT PASSWORD =====
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // Always return same response
    if (!user) {
      return res.json({
        message: 'If an account exists for this email, a reset link has been sent.',
      });
    }

    // Create raw token
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Hash token before saving to DB
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    user.resetToken = hashedToken;
    user.resetTokenExpiry = Date.now() + 1000 * 60 * 15; // 15 mins
    await user.save();

    // TEMP WEB LINK
    const resetLink = `https://saani-web.netlify.app/reset-password.html?token=${resetToken}`;
    

    // OR APP DEEP LINK LATER
    // const resetLink = `saani://reset-password?token=${resetToken}`;

    await transporter.sendMail({
      from: `"Saani App" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Reset your password',
      html: `
        <p>Hello ${user.full_name || 'User'},</p>
        <p>You requested to reset your password.</p>
        <p>Click the link below to continue:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>This link expires in 15 minutes.</p>
        <p>If you did not request this, ignore this email.</p>
      `,
    });

    return res.json({
      message: 'If an account exists for this email, a reset link has been sent.',
    });
  } catch (error) {
    console.error('FORGOT PASSWORD ERROR:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ===== RESET PASSWORD =====
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ message: 'All fields required' });
    }

    if (newPassword.trim().length < 6) {
      return res.status(400).json({
        message: 'Password must be at least 6 characters',
      });
    }

    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const user = await User.findOne({
      resetToken: hashedToken,
      resetTokenExpiry: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword.trim(), salt);

    user.resetToken = null;
    user.resetTokenExpiry = null;

    await user.save();

    return res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('RESET PASSWORD ERROR:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ===== CURRENT USER =====
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error('ME ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
// ===== GOOGLE LOGIN =====
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ message: 'Google credential is required.' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      return res.status(400).json({ message: 'Invalid Google account.' });
    }

    const normalizedEmail = payload.email.trim().toLowerCase();

    let user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(randomPassword, salt);

      user = new User({
        full_name: payload.name || normalizedEmail.split('@')[0],
        email: normalizedEmail,
        phone: '',
        password: hashedPassword,
      });

      await user.save();
    }

    const token = generateToken(user);

    return res.json({
      message: 'Google login successful!',
      token,
      user: {
        id: user._id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        subscription_status: user.subscription_status,
        plan_type: user.plan_type,
        subscription_start: user.subscription_start,
        subscription_expiry: user.subscription_expiry,
        cancel_at_expiry: user.cancel_at_expiry,
      },
    });
  } catch (error) {
  console.error('GOOGLE LOGIN ERROR:', error);

  return res.status(500).json({
    message: 'Google login failed.',
    error: error.message,
  });
}
});
module.exports = router;