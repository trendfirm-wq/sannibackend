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
router.post('/sponsor-callback', async (req, res) => {
  try {
    console.log('🔥 CALLBACK:', req.body);

    const reference =
      req.body.clientReference ||
      req.body.ClientReference ||
      req.body.data?.clientReference;

    const statusRaw =
      req.body.status ||
      req.body.paymentStatus ||
      req.body.Status ||
      req.body.ResponseCode ||
      '';

    if (!reference) {
      return res.status(400).json({ message: 'No reference' });
    }

    const sponsor = await SponsorPayment.findOne({
  reference: reference.trim(),
});

    if (!sponsor) {
      return res.status(404).json({ message: 'Sponsor not found' });
    }

    const user = await User.findById(sponsor.user);

    const status = String(statusRaw).toLowerCase();

    const isSuccess =
      status.includes('success') ||
      status === '0000' ||
      status === 'paid';

    const isFailed =
      status.includes('fail') ||
      status === 'failed' ||
      status === 'cancelled';

    if (isSuccess) {
      sponsor.status = 'completed';
      await sponsor.save();

      if (user) {
        user.sponsor_payment_status = 'completed';
        await user.save();
      }

      return res.json({ success: true, message: 'Payment successful' });
    }

    if (isFailed) {
      sponsor.status = 'failed';
      await sponsor.save();

      if (user) {
        user.sponsor_payment_status = 'failed';
        await user.save();
      }

      return res.json({ success: false, message: 'Payment failed' });
    }

    sponsor.status = 'pending';
    await sponsor.save();

    return res.json({ success: true, message: 'Payment pending' });

  } catch (err) {
    console.error('CALLBACK ERROR:', err);
    return res.status(500).json({ message: 'Callback error' });
  }
});
router.get('/sponsor-status/:reference', auth, async (req, res) => {
  try {
    const sponsor = await SponsorPayment.findOne({
      reference: req.params.reference,
    });

    if (!sponsor) {
      return res.status(404).json({ message: 'Not found' });
    }

    return res.json({
      success: true,
      status: sponsor.status,
      amount: sponsor.amount,
      paymentMethod: sponsor.paymentMethod,
    });

  } catch (err) {
    return res.status(500).json({ message: 'Error checking status' });
  }
});
module.exports = router;