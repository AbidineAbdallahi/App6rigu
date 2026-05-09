const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName:  { type: String, required: true, trim: true },
  email:     { type: String, unique: true, sparse: true, lowercase: true },
  phone:     { type: String, required: true, unique: true },
  password:  { type: String, minlength: 6 },
  role:      { type: String, enum: ['client','driver','admin','agent'], default: 'client' },
  isActive:  { type: Boolean, default: true },
  address:   { street: String, city: { type: String, default: 'Nouakchott' }, zone: String },
  otpCode:   { type: String, default: null },
  otpExpiry: { type: Date,   default: null },
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
userSchema.methods.comparePassword = function(p) {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(p, this.password);
};
userSchema.methods.toJSON = function() {
  const o = this.toObject();
  delete o.password;
  delete o.otpCode;
  delete o.otpExpiry;
  return o;
};

module.exports = mongoose.model('User', userSchema);
