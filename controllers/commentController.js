const Comment = require('../models/Comment');

// GET COMMENTS
exports.getComments = async (req, res) => {
  try {
    const comments = await Comment.find({ trackId: req.params.trackId })
      .sort({ createdAt: -1 });

    res.json(comments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ADD COMMENT
exports.addComment = async (req, res) => {
  try {
    const { trackId, userId, username, text } = req.body;

    if (!trackId || !text) {
      return res.status(400).json({
        message: 'trackId and text are required',
      });
    }

    const comment = await Comment.create({
      trackId,
      userId: userId || null,
      username: username || 'User',
      text,
      likes: 0,
    });

    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// LIKE COMMENT
exports.likeComment = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    comment.likes = (comment.likes || 0) + 1;
    await comment.save();

    res.json(comment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE COMMENT
exports.deleteComment = async (req, res) => {
  try {
    await Comment.findByIdAndDelete(req.params.id);

    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};