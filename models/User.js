const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    full_name: { type: String, required: true },

    email: { type: String, required: true, unique: true },

    phone: { type: String },

    password: { type: String, required: true },

    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
  auth_provider: {
  type: String,
  enum: ['local', 'google'],
  default: 'local',
},

google_id: {
  type: String,
  default: null,
},

email_verified: {
  type: Boolean,
  default: false,
},
    // =========================
    // SUBSCRIPTION SYSTEM
    // =========================
    subscription_status: {
      type: String,
      enum: ['inactive', 'active', 'expired'],
      default: 'inactive',
    },

    plan_type: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly'],
      default: null,
    },

    subscription_start: {
      type: Date,
      default: null,
    },

    subscription_expiry: {
      type: Date,
      default: null,
    },

    cancel_at_expiry: {
      type: Boolean,
      default: false,
    },

    // =========================
    // PAYMENT TRACKING
    // =========================
    payment_reference: {
      type: String,
      default: null,
    },

    payment_status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: null,
    },

    pending_plan_type: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly'],
      default: null,
    },

    // =========================
    // PROFILE UPDATE LIMIT
    // =========================
    profile_update_count: {
      type: Number,
      default: 0,
    },

    profile_update_window_start: {
      type: Date,
      default: null,
    },
  
// =========================
// PUSH NOTIFICATIONS
// =========================
expoPushToken: {
  type: String,
  default: null,
},

notifications_enabled: {
  type: Boolean,
  default: true,
},
    // =========================
    // PASSWORD RESET
    // =========================
    resetToken: {
      type: String,
      default: null,
    },

    resetTokenExpiry: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', userSchema);