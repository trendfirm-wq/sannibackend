const express = require('express');
const axios = require('axios');
const router = express.Router();

const User = require('../models/User');
const auth = require('../middleware/auth');
const SponsorPayment = require('../models/Sponsor');

router.post('/sponsor-pay', auth, async (req, res) => {
  try {
    const { amount, paymentMethod } = req.body;

    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount < 1) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    if (!req.user?.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const reference = `SPN_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    // ✅ SAVE USER STATUS
    user.sponsor_payment_reference = reference;
    user.sponsor_payment_status = 'pending';
    await user.save();

    // ✅ SAVE SPONSOR RECORD (IMPORTANT FIX)
    await SponsorPayment.create({
      user: user._id,
      amount: numericAmount,
      paymentMethod,
      reference,
      status: 'pending',
      createdAt: new Date(),
    });

    const authHeader = Buffer.from(
      `${process.env.HUBTEL_CLIENT_ID}:${process.env.HUBTEL_CLIENT_SECRET}`
    ).toString('base64');

    const payload = {
      totalAmount: numericAmount,
      description: `Sanni Sponsorship (${paymentMethod})`,
      callbackUrl: process.env.HUBTEL_CALLBACK_URL,
      returnUrl: process.env.HUBTEL_RETURN_URL,
      cancellationUrl: process.env.HUBTEL_RETURN_URL,
      merchantAccountNumber: process.env.HUBTEL_MERCHANT_ID,
      clientReference: reference,
    };

    const response = await axios.post(
      'https://payproxyapi.hubtel.com/items/initiate',
      payload,
      {
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const checkoutUrl = response.data?.data?.checkoutUrl;

    if (!checkoutUrl) {
      return res.status(500).json({ message: 'No checkout URL returned' });
    }

    return res.json({
      success: true,
      checkoutUrl,
      reference,
    });

  } catch (err) {
    console.log('🔥 SPONSOR ERROR:', err.response?.data || err.message);

    return res.status(500).json({
      message: 'Sponsor payment failed',
      error: err.response?.data || err.message,
    });
  }
});
module.exports = router;