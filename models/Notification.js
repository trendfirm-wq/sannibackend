const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },

    body: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      default: 'general',
    },

    data: {
      type: Object,
      default: {},
    },

    recipients: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        read: {
          type: Boolean,
          default: false,
        },
        readAt: {
          type: Date,
          default: null,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Notification', notificationSchema);