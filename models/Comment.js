const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    trackId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    username: {
      type: String,
      default: 'User',
    },

    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Comment', commentSchema);