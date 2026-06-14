const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');

// 🔵 GET comments for a track
router.get('/:trackId', async (req, res) => {
  try {
    const comments = await Comment.find({ trackId: req.params.trackId })
      .sort({ createdAt: -1 });

    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🟢 POST new comment
router.post('/', async (req, res) => {
  try {
    const { trackId, userId, userName, text } = req.body;

    if (!trackId || !userId || !text) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const comment = new Comment({
      trackId,
      userId,
      userName,
      text,
    });

    await comment.save();

    res.json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;