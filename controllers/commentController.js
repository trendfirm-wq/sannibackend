const Comment = require('../models/Comment');

exports.addComment = async (req, res) => {
  try {
    const { trackId, userId, userName, comment } = req.body;

    if (!trackId || !userId || !userName || !comment) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    const newComment = await Comment.create({
      trackId,
      userId,
      userName,
      comment,
    });

    res.status(201).json({
      success: true,
      comment: newComment,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: 'Failed to add comment',
    });
  }
};

exports.getComments = async (req, res) => {
  try {
    const { trackId } = req.params;

    const comments = await Comment.find({ trackId })
      .sort({ createdAt: -1 });

    res.json(comments);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: 'Failed to load comments',
    });
  }
};