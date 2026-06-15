const express = require('express');
const axios = require('axios');
const router = express.Router();

const User = require('../models/User');
const auth = require('../middleware/auth');

const PRICES = {
  monthly: 20,
  quarterly: 55,
  yearly: 200,
};

// ===================================================
// 1️⃣ CREATE PAYMENT
// ===================================================
router.post('/pay', auth, async (req, res) => {
  try {
    const { plan } = req.body;

    if (!plan || !PRICES[plan]) {
      return res.status(400).json({
        message: 'Invalid plan',
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    // AUTO EXPIRE IF OLD SUB ENDED
    if (
      user.subscription_status === 'active' &&
      user.subscription_expiry &&
      new Date(user.subscription_expiry) <= new Date()
    ) {
      user.subscription_status = 'expired';
      await user.save();
    }

    // BLOCK SAME ACTIVE PLAN
    if (
      user.subscription_status === 'active' &&
      user.plan_type === plan &&
      user.subscription_expiry &&
      new Date(user.subscription_expiry) > new Date()
    ) {
      return res.status(400).json({
        message: 'You already have this active plan',
      });
    }

    const amount = PRICES[plan];
    const reference = `INV_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const authHeader = Buffer.from(
      `${process.env.HUBTEL_CLIENT_ID}:${process.env.HUBTEL_CLIENT_SECRET}`
    ).toString('base64');

    // SAVE PAYMENT INFO FIRST
    user.payment_reference = reference;
    user.payment_status = 'pending';
    user.pending_plan_type = plan;
    await user.save();

    const payload = {
      totalAmount: Number(amount.toFixed(2)),
      description: `${plan} subscription`,
      callbackUrl: process.env.HUBTEL_CALLBACK_URL,
      returnUrl: process.env.HUBTEL_RETURN_URL,
      cancellationUrl: process.env.HUBTEL_RETURN_URL,
      merchantAccountNumber: process.env.HUBTEL_MERCHANT_ID,
      clientReference: reference,
    };

    console.log('🔥 HUBTEL REQUEST:', payload);

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

    console.log('🔥 HUBTEL RESPONSE:', response.data);

    const checkoutUrl = response.data?.data?.checkoutUrl;

    if (!checkoutUrl) {
      user.payment_status = 'failed';
      await user.save();

      return res.status(500).json({
        message: 'No checkout URL returned',
      });
    }

    return res.json({
      success: true,
      checkoutUrl,
      reference,
    });
  } catch (err) {
    console.log('🔥 HUBTEL ERROR:', err.response?.data || err.message);

    try {
      const user = await User.findById(req.user.id);
      if (user) {
        user.payment_status = 'failed';
        await user.save();
      }
    } catch (saveErr) {
      console.log('🔥 FAILED TO MARK PAYMENT FAILED:', saveErr.message);
    }

    return res.status(500).json({
      message: 'Hubtel failed',
      error: err.response?.data || err.message,
    });
  }
});

// ===================================================
// 2️⃣ HUBTEL CALLBACK
// ===================================================
router.post('/callback', async (req, res) => {
  try {
    console.log('🔥 HUBTEL CALLBACK BODY:', JSON.stringify(req.body, null, 2));

    const reference =
      req.body.clientReference ||
      req.body.ClientReference ||
      req.body.Data?.ClientReference ||
      req.body.data?.clientReference ||
      req.body.Response?.ClientReference;

    const status =
      req.body.status ||
      req.body.Status ||
      req.body.ResponseCode ||
      req.body.Data?.Status ||
      req.body.data?.status ||
      req.body.Response?.Status;

    console.log('🔥 Extracted reference:', reference);
    console.log('🔥 Extracted status:', status);

    if (!reference) {
      return res.status(400).json({
        message: 'No payment reference found in callback',
      });
    }

    const user = await User.findOne({ payment_reference: reference });

    if (!user) {
      console.log('❌ No user found for reference:', reference);
      return res.status(404).json({
        message: 'User not found for reference',
      });
    }

    const paid =
      String(status).toLowerCase() === 'success' ||
      String(status).toLowerCase() === 'successful' ||
      String(status).toLowerCase() === 'paid' ||
      String(status) === '0000';

    if (!paid) {
      user.payment_status = 'failed';
      await user.save();

      console.log('⚠️ Payment not successful:', status);

      return res.status(200).json({
        message: 'Payment not successful',
      });
    }

    const plan = user.pending_plan_type;

    if (!plan) {
      console.log('❌ No pending plan type found on user');
      return res.status(400).json({
        message: 'No pending plan type found',
      });
    }

    const start = new Date();
    const expiry = new Date(start);

    if (plan === 'monthly') {
      expiry.setMonth(expiry.getMonth() + 1);
    } else if (plan === 'quarterly') {
      expiry.setMonth(expiry.getMonth() + 3);
    } else if (plan === 'yearly') {
      expiry.setFullYear(expiry.getFullYear() + 1);
    } else {
      return res.status(400).json({
        message: 'Invalid pending plan type',
      });
    }

    user.payment_status = 'completed';
    user.subscription_status = 'active';
    user.plan_type = plan;
    user.subscription_start = start;
    user.subscription_expiry = expiry;
    user.pending_plan_type = null;

    await user.save();

    console.log('✅ USER SUBSCRIPTION ACTIVATED:', user.email);

    return res.status(200).json({
      message: 'Callback processed successfully',
    });
  } catch (err) {
    console.error('🔥 CALLBACK ERROR:', err);
    return res.status(500).json({
      message: 'Server error in callback',
    });
  }
});

// ===================================================
// 3️⃣ CHECK PAYMENT STATUS
// ===================================================
router.get('/status/:reference', auth, async (req, res) => {
  try {
    const { reference } = req.params;

    const user = await User.findOne({
      _id: req.user.id,
      payment_reference: reference,
    }).select('-password');

    if (!user) {
      return res.status(404).json({
        message: 'Payment record not found',
      });
    }

    return res.json({
      success: true,
      payment_reference: user.payment_reference,
      payment_status: user.payment_status,
      subscription_status: user.subscription_status,
      plan_type: user.plan_type,
      subscription_start: user.subscription_start,
      subscription_expiry: user.subscription_expiry,
    });
  } catch (err) {
    console.error('🔥 STATUS ERROR:', err);
    return res.status(500).json({
      message: 'Server error',
    });
  }
});
router.post('/cancel', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.subscription_status !== 'active') {
      return res.status(400).json({ message: 'No active subscription to cancel' });
    }

    if (user.cancel_at_expiry) {
      return res.status(400).json({
        message: 'Subscription already set to cancel',
      });
    }

    user.cancel_at_expiry = true;
    await user.save();

    return res.json({
      success: true,
      message: 'Subscription will end on expiry date',
      cancel_at_expiry: true,
      subscription_expiry: user.subscription_expiry,
    });
  } catch (err) {
    console.error('CANCEL ERROR:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});
// ===================================================
// 5️⃣ CHECK HUBTEL TRANSACTION STATUS DIRECTLY
// ===================================================
router.get('/hubtel-status/:clientReference', auth, async (req, res) => {
  try {
    const { clientReference } = req.params;

    if (!clientReference) {
      return res.status(400).json({
        success: false,
        message: 'clientReference is required',
      });
    }

    const user = await User.findOne({
      _id: req.user.id,
      payment_reference: clientReference,
    }).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Payment reference not found for this user',
      });
    }

    if (!process.env.HUBTEL_COLLECTION_ACCOUNT_NUMBER) {
      return res.status(500).json({
        success: false,
        message: 'HUBTEL_COLLECTION_ACCOUNT_NUMBER is missing',
      });
    }

    const authHeader = Buffer.from(
      `${process.env.HUBTEL_CLIENT_ID}:${process.env.HUBTEL_CLIENT_SECRET}`
    ).toString('base64');

    const encodedReference = encodeURIComponent(clientReference);

    const url = `https://api-txnstatus.hubtel.com/transactions/${process.env.HUBTEL_COLLECTION_ACCOUNT_NUMBER}/status?clientReference=${encodedReference}`;

    console.log('🔥 CHECKING HUBTEL STATUS:', url);

    const response = await axios.get(url, {
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('🔥 HUBTEL STATUS RESPONSE:', response.data);

    const hubtelData = response.data;

    const hubtelStatus =
      hubtelData?.data?.status ||
      hubtelData?.Data?.Status ||
      hubtelData?.status ||
      hubtelData?.Status;

    const normalizedStatus = String(hubtelStatus || '').toLowerCase();

    const paid = normalizedStatus === 'paid';

    const unpaid =
      normalizedStatus === 'unpaid' ||
      normalizedStatus === 'pending';

    const failed =
      normalizedStatus === 'failed' ||
      normalizedStatus === 'cancelled' ||
      normalizedStatus === 'canceled' ||
      normalizedStatus === 'refunded';

    if (paid && user.payment_status !== 'completed') {
      const plan = user.pending_plan_type || user.plan_type;

      if (!plan) {
        return res.status(400).json({
          success: false,
          message: 'Payment was successful, but no pending plan type was found',
          hubtelStatus,
          hubtel: hubtelData,
        });
      }

      const start = new Date();
      const expiry = new Date(start);

      if (plan === 'monthly') {
        expiry.setMonth(expiry.getMonth() + 1);
      } else if (plan === 'quarterly') {
        expiry.setMonth(expiry.getMonth() + 3);
      } else if (plan === 'yearly') {
        expiry.setFullYear(expiry.getFullYear() + 1);
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid plan type',
          plan,
        });
      }

      user.payment_status = 'completed';
      user.subscription_status = 'active';
      user.plan_type = plan;
      user.subscription_start = start;
      user.subscription_expiry = expiry;
      user.pending_plan_type = null;
      user.cancel_at_expiry = false;

      await user.save();
    }

    if (failed && user.payment_status !== 'completed') {
      user.payment_status = 'failed';
      await user.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Hubtel transaction status checked successfully',
      payment_reference: user.payment_reference,
      local_payment_status: user.payment_status,
      subscription_status: user.subscription_status,
      plan_type: user.plan_type,
      subscription_start: user.subscription_start,
      subscription_expiry: user.subscription_expiry,
      hubtel_status: hubtelStatus,
      hubtel_response_code: hubtelData?.responseCode || hubtelData?.ResponseCode,
      hubtel: hubtelData,
    });
  } catch (err) {
    console.error('🔥 HUBTEL STATUS CHECK ERROR:', err.response?.data || err.message);

    return res.status(500).json({
      success: false,
      message: 'Unable to check Hubtel transaction status',
      error: err.response?.data || err.message,
    });
  }
});
module.exports = router;