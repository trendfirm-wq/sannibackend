const mongoose = require('mongoose');

const sponsorSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: String,
  email: String,
  planType: String, // monthly | one-time
  amount: Number,
  status: { type: String, default: 'active' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Sponsor', sponsorSchema);