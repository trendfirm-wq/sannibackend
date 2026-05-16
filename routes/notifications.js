const express = require('express');
const router = express.Router();

const User = require('../models/User');
const auth = require('../middleware/auth');
const { sendPushNotification } = require('../utils/notificationService');

// Save user device token
router.post('/save-token', auth, async (req, res) => {
  try {
    const { expoPushToken } = req.body;

    if (!expoPushToken) {
      return res.status(400).json({ message: 'Expo push token is required' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        expoPushToken,
        notifications_enabled: true,
      },
      { new: true }
    ).select('-password');

    return res.json({
      success: true,
      message: 'Push token saved',
      user,
    });
  } catch (err) {
    console.error('SAVE PUSH TOKEN ERROR:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Admin send notification to all users
router.post('/send-all', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin only' });
    }

    const { title, body, data } = req.body;

    if (!title || !body) {
      return res.status(400).json({ message: 'Title and body are required' });
    }

    const users = await User.find({
      expoPushToken: { $ne: null },
      notifications_enabled: true,
    }).select('expoPushToken');

    const tokens = users.map(user => user.expoPushToken);

    await sendPushNotification({
      tokens,
      title,
      body,
      data: data || {},
    });

    return res.json({
      success: true,
      message: 'Notification sent',
      count: tokens.length,
    });
  } catch (err) {
    console.error('SEND ALL NOTIFICATION ERROR:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;