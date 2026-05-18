const express = require('express');
const router = express.Router();

const User = require('../models/User');
const auth = require('../middleware/auth');
const { sendPushNotification } = require('../utils/notificationService');
const Notification = require('../models/Notification');
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
}).select('_id expoPushToken pushAppOwnership');
   
const tokens = users
  .map(user => user.expoPushToken)
  .filter(Boolean);

    await sendPushNotification({
      tokens,
      title,
      body,
      data: data || {},
    });
await Notification.create({
  title,
  body,
  type: data?.type || 'general',
  data: data || {},

  recipients: users.map(user => ({
    user: user._id,
    read: false,
  })),
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
// Get my notifications
router.get('/my', auth, async (req, res) => {
  try {
    const notifications = await Notification.find({
      'recipients.user': req.user.id,
    })
      .sort({ createdAt: -1 })
      .limit(50);

    const formatted = notifications.map(notification => {
      const recipient = notification.recipients.find(
        r => r.user.toString() === req.user.id
      );

      return {
        _id: notification._id,
        title: notification.title,
        body: notification.body,
        type: notification.type,
        data: notification.data,
        read: recipient?.read || false,
        readAt: recipient?.readAt || null,
        createdAt: notification.createdAt,
      };
    });

    res.json(formatted);
  } catch (err) {
    console.error('GET MY NOTIFICATIONS ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get unread count
router.get('/unread-count', auth, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipients: {
        $elemMatch: {
          user: req.user.id,
          read: false,
        },
      },
    });

    res.json({ count });
  } catch (err) {
    console.error('UNREAD COUNT ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark one notification as read
router.patch('/:id/read', auth, async (req, res) => {
  try {
    await Notification.updateOne(
      {
        _id: req.params.id,
        'recipients.user': req.user.id,
      },
      {
        $set: {
          'recipients.$.read': true,
          'recipients.$.readAt': new Date(),
        },
      }
    );

    res.json({ success: true });
  } catch (err) {
    console.error('MARK READ ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark all my notifications as read
router.patch('/mark-all/read', auth, async (req, res) => {
  try {
    await Notification.updateMany(
      {
        recipients: {
          $elemMatch: {
            user: req.user.id,
            read: false,
          },
        },
      },
      {
        $set: {
          'recipients.$[elem].read': true,
          'recipients.$[elem].readAt': new Date(),
        },
      },
      {
        arrayFilters: [{ 'elem.user': req.user.id }],
      }
    );

    res.json({ success: true });
  } catch (err) {
    console.error('MARK ALL READ ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
module.exports = router;