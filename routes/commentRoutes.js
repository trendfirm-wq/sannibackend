const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');


// ✅ GET ALL COMMENTS (NEW - for CommentsScreen)
router.get('/', async (req, res) => {
  try {
    const comments = await Comment.find()
      .sort({ createdAt: -1 });

    res.json(comments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ✅ GET COMMENTS FOR A TRACK
router.get('/:trackId', async (req, res) => {
  try {
    const comments = await Comment.find({ trackId: req.params.trackId })
      .sort({ createdAt: -1 });

    res.json(comments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ✅ POST COMMENT
router.post('/', async (req, res) => {
  try {
    const { trackId, userId, username, text } = req.body;

    if (!trackId || !userId || !text) {
      return res.status(400).json({
        message: 'Missing required fields'
      });
    }

    const comment = new Comment({
      trackId,
      userId,
      username,
      text,
    });

    const saved = await comment.save();
    res.json(saved);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ❌ DELETE COMMENT
router.delete('/:id', async (req, res) => {
  try {
    await Comment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;