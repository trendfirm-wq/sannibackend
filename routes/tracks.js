const express = require('express');
const router = express.Router();
const multer = require('multer');
const Track = require('../models/Track');
const Artist = require('../models/Artist');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');
console.log("UPLOAD ROUTE HIT");
const User = require('../models/User');
const Stream = require('../models/Stream');
const { requestToPay, checkPayment } = require('../utils/momo');
const { initializePayment, verifyPayment } = require('../utils/paystack');
const crypto = require('crypto');
const { sendPushNotification } = require('../utils/notificationService');
 
dotenv.config();

// ===== MULTER CONFIG =====
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    if (file.fieldname === 'audio') cb(null, 'uploads/audio');
    else if (file.fieldname === 'video') cb(null, 'uploads/video'); // ✅ FIXED
    else if (file.fieldname === 'cover') cb(null, 'uploads/covers');
  },
  filename: function(req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });

// ===== AUTH MIDDLEWARE =====
const auth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided.' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid token.' });
    }
};

router.post('/upload', upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'video', maxCount: 1 },
  { name: 'cover', maxCount: 1 }
]), async (req, res) => {
  try {
    const { title, artist_name, is_premium, category, featured } = req.body;
// 🔥 CATEGORY MAPPING (CRITICAL)
const categoryMap = {
  'Old Nasheed': 'nazm',
  'Latest Nasheed': 'nasheed',
  'Centenary': 'qaseeda'
};

let normalizedCategory = categoryMap[category] || category;

// fallback normalize (for others like "Tabligh Songs")
normalizedCategory = normalizedCategory
  ?.toLowerCase()
  .trim()
  .replace(/\s+/g, '_');



    if (!title || !artist_name || (!req.files.audio && !req.files.video)) {
      return res.status(400).json({
        message: 'Title, artist name, and audio or video required.'
      });
    }

    // ⭐ Find or create artist
    let artist = await Artist.findOne({ name: artist_name });

    if (!artist) {
      artist = new Artist({ name: artist_name });
      await artist.save();
    }

    let fileUrl = "";
    let finalType = "audio";

    // 🎬 VIDEO
    if (req.files.video && req.files.video[0]) {
      const videoUpload = await cloudinary.uploader.upload(
        req.files.video[0].path,
        {
          resource_type: "video",
          folder: "ahmadi-videos"
        }
      );

      fileUrl = videoUpload.secure_url;
      finalType = "video";
    }

    // 🎵 AUDIO
    else if (req.files.audio && req.files.audio[0]) {
      const audioUpload = await cloudinary.uploader.upload(
        req.files.audio[0].path,
        {
          resource_type: "auto", // ✅ better
          folder: "ahmadi-music"
        }
      );

      fileUrl = audioUpload.secure_url;
      finalType = "audio";
    }

    // ❌ STOP if upload failed
    if (!fileUrl) {
      return res.status(400).json({ message: "Upload failed" });
    }

    let coverUrl = "";

    if (req.files.cover && req.files.cover[0]) {
      const coverUpload = await cloudinary.uploader.upload(
        req.files.cover[0].path,
        { folder: "ahmadi-covers" }
      );

      coverUrl = coverUpload.secure_url;
    }

    // 🧹 CLEAN FILES
    if (req.files.audio?.[0]) fs.unlinkSync(req.files.audio[0].path);
    if (req.files.video?.[0]) fs.unlinkSync(req.files.video[0].path);
    if (req.files.cover?.[0]) fs.unlinkSync(req.files.cover[0].path);

    const track = new Track({
      artist: artist._id,
      title,
     category: normalizedCategory, // ✅ FIXED
      type: finalType,

      file_path: finalType === 'audio' ? fileUrl : "",
      video_url: finalType === 'video' ? fileUrl : "",

      cover_image: coverUrl,

      // 🔒 FORCE PREMIUM FOR VIDEOS
      is_premium: finalType === 'video' ? true : is_premium === 'true',

      featured: featured === 'true'
    });

    await track.save();
    
    const usersWithTokens = await User.find({
  expoPushToken: { $ne: null },
  notifications_enabled: true,
}).select('expoPushToken');

const tokens = usersWithTokens.map(user => user.expoPushToken);

if (tokens.length > 0) {
  await sendPushNotification({
    tokens,
    title: finalType === 'video' ? 'New video on Sanni 🎬' : 'New song on Sanni 🎧',
    body: `${title} is now available. Tap to listen.`,
    data: {
      type: finalType === 'video' ? 'video' : 'track',
      trackId: track._id.toString(),
    },
  });
}

    res.status(201).json({
      message: 'Track uploaded successfully!',
      track
    });

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/stream/:id', auth, async (req, res) => {
  try {
    const track = await Track.findById(req.params.id);

    if (!track) {
      return res.status(404).json({ message: 'Track not found.' });
    }

    // 🔒 Premium check
    if (track.is_premium) {
      const user = await User.findById(req.user.id);

      if (
        !user ||
        user.subscription_status !== 'active' ||
        (user.subscription_expiry && user.subscription_expiry < new Date())
      ) {
        return res.status(403).json({
          message: 'Subscription required to play this track.'
        });
      }
    }

    // 📈 increment streams
    track.total_streams += 1;
    await track.save();

    const mediaUrl =
      track.type === 'video'
        ? track.video_url
        : track.file_path;

    // ❌ safety
    if (!mediaUrl) {
      return res.status(400).json({ message: 'Media not available' });
    }

    res.redirect(mediaUrl);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});
router.get('/create-test-artist', async (req, res) => {
  const artist = new Artist({
    name: "Test Artist",
    profile_image: ""
  });

  await artist.save();

  res.json(artist);
});
router.get('/category/:category', async (req, res) => {
  try {
    const category = req.params.category;

    const tracks = await Track.find({
      category: new RegExp(`^${category}$`, 'i')
    })
      .populate('artist', 'name')
      .sort({ uploaded_at: -1 });

    res.json(tracks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch category tracks' });
  }
});
router.post('/record-stream', auth, async (req, res) => {
  try {
    const { trackId, duration } = req.body;

    const track = await Track.findById(trackId).populate('artist');

    const stream = new Stream({
      user: req.user.id,
      track: trackId,
      artist: track.artist._id,
      duration
    });

    await stream.save();

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Stream record failed' });
  }
});
router.get('/analytics', async (req, res) => {
  try {

    // total listening time
    const totalDuration = await Stream.aggregate([
      { $group: { _id: null, total: { $sum: "$duration" } } }
    ]);

    // total streams count
    const totalStreams = await Stream.countDocuments();

    // top tracks
    const topTracks = await Stream.aggregate([
      {
        $group: {
          _id: "$track",
          totalDuration: { $sum: "$duration" }
        }
      },
      { $sort: { totalDuration: -1 } },
      { $limit: 5 }
    ]);

    const topArtists = await Stream.aggregate([
  {
    $group: {
      _id: "$artist",
      totalDuration: { $sum: "$duration" }
    }
  },
  {
    $lookup: {
      from: "artists",
      localField: "_id",
      foreignField: "_id",
      as: "artistInfo"
    }
  },
  {
    $unwind: "$artistInfo"
  },
  {
    $project: {
      name: "$artistInfo.name",
      totalDuration: 1
    }
  },
  { $sort: { totalDuration: -1 } },
  { $limit: 5 }
]);
    res.json({
      totalMinutes: Math.round((totalDuration[0]?.total || 0) / 60),
      totalStreams,
      topTracks,
      topArtists
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Analytics failed' });
  }
});
router.get('/recent-streams', async (req, res) => {
  try {
    const streams = await Stream.find()
      .populate('track', 'title')
      .populate('artist', 'name')
      .populate('user', 'email')
      .sort({ created_at: -1 })
      .limit(50);

    res.json(streams);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch streams' });
  }
});
router.get('/behaviour', async (req, res) => {
  try {
    const streams = await Stream.find()
      .populate('track', 'title')
      .populate('artist', 'name')
      .populate('user', 'email')
      .sort({ created_at: -1 })
      .limit(100);

    res.json(streams);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Behaviour fetch failed' });
  }
});
router.get('/behaviour-insights', async (req, res) => {
  try {

    // average listen duration
    const avgDuration = await Stream.aggregate([
      {
        $group: {
          _id: null,
          avg: { $avg: "$duration" }
        }
      }
    ]);

    // top listeners
    const topUsers = await Stream.aggregate([
      {
        $group: {
          _id: "$user",
          totalTime: { $sum: "$duration" }
        }
      },
      { $sort: { totalTime: -1 } },
      { $limit: 5 }
    ]);

    const topTracks = await Stream.aggregate([
  {
    $group: {
      _id: "$track",
      totalDuration: { $sum: "$duration" }
    }
  },
  {
    $lookup: {
      from: "tracks",
      localField: "_id",
      foreignField: "_id",
      as: "trackInfo"
    }
  },
  {
    $unwind: "$trackInfo"
  },
  {
    $project: {
      title: "$trackInfo.title",
      totalDuration: 1
    }
  },
  { $sort: { totalDuration: -1 } },
  { $limit: 5 }
]);

    // peak hours
    const peakHours = await Stream.aggregate([
      {
        $group: {
          _id: { $hour: "$created_at" },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    res.json({
      avgListenSeconds: avgDuration[0]?.avg || 0,
      topUsers,
      topTracks,
      peakHours
    });

  } catch (err) {
    res.status(500).json({ error: 'Behaviour insights failed' });
  }
});
router.get('/all', async (req, res) => {
  try {
    const tracks = await Track.find()
      .populate('artist', 'name')
      .sort({ uploaded_at: -1 });

    res.json(tracks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});
router.post('/momo/pay', auth, async (req, res) => {
  try {
    const { phone, plan } = req.body;

    if (!phone || !plan) {
      return res.status(400).json({ message: 'Phone and plan required' });
    }

    // Determine amount
    let amount;
    if (plan === 'monthly') {
      amount = 5;
    } else if (plan === 'yearly') {
      amount = 50;
    } else {
      return res.status(400).json({ message: 'Invalid plan' });
    }

    // Get user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Initiate payment
    const referenceId = await requestToPay(phone, amount);

    // (Optional) Save pending payment
    user.payment_reference = referenceId;
    user.payment_status = 'pending';
    await user.save();

    res.json({
      message: 'MoMo payment request sent. Please approve on your phone.',
      referenceId
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to initiate payment' });
  }
});
router.get('/momo/status/:ref', auth, async (req, res) => {
  try {
    const { ref } = req.params;

    const result = await checkPayment(ref);
console.log("MTN STATUS RESPONSE:", result); // 👈 ADD THIS
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // If payment successful → activate subscription
    if (result.status === 'SUCCESSFUL') {

      let expiry = new Date();

      // Adjust based on your pricing
      if (result.amount === "5") {
        expiry.setMonth(expiry.getMonth() + 1);
      } else {
        expiry.setFullYear(expiry.getFullYear() + 1);
      }

      user.subscription_status = 'active';
      user.subscription_expiry = expiry;
      user.payment_status = 'completed';

      await user.save();
    }

    res.json(result);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to check payment status' });
  }
});
router.post('/paystack/pay', auth, async (req, res) => {
  try {
    const { email, plan } = req.body;

    if (!email || !plan) {
      return res.status(400).json({ message: 'Email and plan required' });
    }

    // 💰 Centralized pricing (clean + scalable)
    const prices = {
      monthly: 20,
      quarterly: 55,
      yearly: 200,
    };

    const amount = prices[plan];

    if (!amount) {
      return res.status(400).json({ message: 'Invalid plan' });
    }

    // 🔍 Debug (optional but useful)
    console.log("PLAN:", plan);
    console.log("AMOUNT (GHS):", amount);

   const payment = await initializePayment(email, amount, {
  userId: req.user.id,
  plan
});

    res.json({
      authorization_url: payment.authorization_url,
      reference: payment.reference
    });

  } catch (err) {
    console.error("PAYSTACK INIT ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: 'Payment init failed' });
  }
});
router.get('/paystack/verify/:reference', auth, async (req, res) => {
  try {
    const { reference } = req.params;

    const result = await verifyPayment(reference);

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (result.status === 'success') {

      let expiry = new Date();

      if (result.amount === 2000) {
        expiry.setMonth(expiry.getMonth() + 1);
      } else {
        expiry.setFullYear(expiry.getFullYear() + 1);
      }

      user.subscription_status = 'active';
      user.subscription_expiry = expiry;

      await user.save();
    }

    if (result.status === 'success') {

  let expiry = new Date();

  if (result.amount === 2000) {
    expiry.setMonth(expiry.getMonth() + 1);
  } else {
    expiry.setFullYear(expiry.getFullYear() + 1);
  }

  user.subscription_status = 'active';
  user.subscription_expiry = expiry;

  await user.save();

  // 🔥 CREATE NEW TOKEN (THIS IS THE FIX)
  const token = jwt.sign(
    {
      id: user._id,
      email: user.email,
      subscription_status: user.subscription_status
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return res.json({
    status: "SUCCESSFUL",
    token // 🔥 SEND NEW TOKEN
  });
}

res.json({ status: "FAILED" });

  } catch (err) {
    console.error("VERIFY ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: 'Verification failed' });
  }
});
async function activateUserSubscription(email, amount) {

  let plan;
  let expiry = new Date();

  if (amount === 2000) {
    plan = 'monthly';
    expiry.setMonth(expiry.getMonth() + 1);
  } 
  else if (amount === 5500) {
    plan = 'quarterly';
    expiry.setMonth(expiry.getMonth() + 3);
  } 
  else if (amount === 20000) {
    plan = 'yearly';
    expiry.setFullYear(expiry.getFullYear() + 1);
  }

  if (!plan) {
    console.log("❌ Unknown amount:", amount);
    return;
  }

  await User.findOneAndUpdate(
    { email },
    {
      subscription_status: 'active',
      plan_type: plan,              // ✅ FIXED
      subscription_start: new Date(), // ✅ FIXED
      subscription_expiry: expiry
    }
  );
} // ✅ CLOSE FUNCTION
router.post('/paystack/webhook', async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;

    const hash = crypto
      .createHmac('sha512', secret)
      .update(req.rawBody)
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(401).send('Invalid signature');
    }

    const event = req.body;

    

if (event.event === 'charge.success') {
  const data = event.data;

  const reference = data.reference;

  // 🔥 GET FROM METADATA (CRITICAL FIX)
  const userId = data.metadata?.userId;
  let plan = data.metadata?.plan;

  console.log("Webhook event:", event.event);

  if (!userId || !plan) {
    console.log("❌ Missing metadata:", data.metadata);
    return res.sendStatus(200);
  }

  plan = plan.toLowerCase().trim();

  // 🔒 PREVENT DUPLICATE PROCESSING
  const existingUser = await User.findById(userId);

  if (existingUser?.payment_reference === reference) {
    console.log("⚠️ Duplicate webhook:", reference);
    return res.sendStatus(200);
  }

  // 🔥 CALCULATE EXPIRY
  const now = new Date();
  let expiry = new Date();

  if (plan === 'monthly') expiry.setMonth(now.getMonth() + 1);
  if (plan === 'quarterly') expiry.setMonth(now.getMonth() + 3);
  if (plan === 'yearly') expiry.setFullYear(now.getFullYear() + 1);

  // 🔥 UPDATE CORRECT USER
  await User.findByIdAndUpdate(userId, {
    subscription_status: 'active',
    plan_type: plan,
    subscription_start: now,
    subscription_expiry: expiry,
    payment_reference: reference
  });

  console.log("🎉 Correct user updated:", userId, plan);
}

    res.sendStatus(200);

  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});
router.get('/public/:id', async (req, res) => {
  try {
    const track = await Track.findById(req.params.id)
      .populate('artist', 'name');

    if (!track) {
      return res.status(404).json({
        message: 'Track not found',
      });
    }

 res.json({
  id: track._id,
  _id: track._id,
  title: track.title,
  artist: track.artist,
  artist_name: track.artist?.name || 'Unknown Artist',
  cover_image: track.cover_image,
  type: track.type,
  is_premium: track.is_premium,

  file_path: track.file_path,
  audio_url: track.file_path,
  video_url: track.video_url,

  share_url: `https://sanni-share.netlify.app/track/${track._id}`,
});
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: 'Server error',
    });
  }
});
// ===================================================
// PUBLIC SHARE DETAILS
// ===================================================
router.get('/share/:id', async (req, res) => {
  try {
    const track = await Track.findById(req.params.id)
      .populate('artist', 'name');

    if (!track) {
      return res.status(404).json({
        message: 'Track not found',
      });
    }

    const artistName =
      track.artist?.name || 'Sanni';

    return res.json({
      success: true,

      id: track._id,

      title: track.title || 'Untitled',

      artist: artistName,

      cover_image: track.cover_image || '',

      type: track.type || 'audio',

      is_premium: !!track.is_premium,

      // ✅ WEB SHARE PAGE
      share_url: `https://sanni-share.netlify.app/track/${track._id}`,

      // ✅ APP DEEP LINK
      app_link: `saani://track/${track._id}`,

      // ✅ PLAY STORE
      play_store_url:
        'https://play.google.com/store/apps/details?id=com.trendingpapa.saani',

      message: `Listen to "${track.title}" on Sanni.`,
    });

  } catch (err) {
    console.error('SHARE DETAILS ERROR:', err.message);

    return res.status(500).json({
      message: 'Server error',
      error: err.message,
    });
  }
});
module.exports = router;
