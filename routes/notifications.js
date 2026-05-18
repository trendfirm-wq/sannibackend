const express = require('express');
const router = express.Router();

const User = require('../models/User');
const auth = require('../middleware/auth');
const { sendPushNotification } = require('../utils/notificationService');

router.post('/save-token', auth, async (req, res) => {
  try {
    const { expoPushToken, deviceType, appOwnership } = req.body;

    if (!expoPushToken) {
      return res.status(400).json({ message: 'Expo push token is required' });
    }

    // Remove this same token from other users first
    await User.updateMany(
      { expoPushToken },
      {
        $unset: {
          expoPushToken: '',
        },
      }
    );

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        expoPushToken,
        pushDeviceType: deviceType || 'unknown',
        pushAppOwnership: appOwnership || 'unknown',
        notifications_enabled: true,
      },
      { new: true }
    ).select('-password');

    console.log('PUSH TOKEN SAVED:', {
      userId: req.user.id,
      expoPushToken,
      deviceType,
      appOwnership,
    });

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
  expoPushToken: { $exists: true, $ne: null },
  notifications_enabled: true,
}).select('expoPushToken pushAppOwnership');

const tokens = users
  .map(user => user.expoPushToken)
  .filter(Boolean);

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