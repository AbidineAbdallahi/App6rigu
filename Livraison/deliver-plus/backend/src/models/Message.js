const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  order:         { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  sender:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderRole:    { type: String, enum: ['client', 'driver'], required: true },
  messageType:   { type: String, enum: ['text', 'audio'], default: 'text' },
  text:          { type: String, maxlength: 500 },
  audioUrl:      { type: String },
  audioDuration: { type: Number },
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);
