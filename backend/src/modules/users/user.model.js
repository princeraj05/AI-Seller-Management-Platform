import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    firebaseUid: {
      type: String,
      sparse: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      default: 'Prince Admin',
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: false, // Optional if authenticated solely via Firebase
      select: false,   // Never return password hash in regular queries
    },
    storeName: {
      type: String,
      default: 'My Super Seller Store',
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      default: null,
    },
    sellerId: {
      type: String,
      index: true,
      default: function () {
        return this._id ? this._id.toString() : null;
      },
    },
    role: {
      type: String,
      enum: ['seller', 'admin', 'staff'],
      default: 'seller',
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    mustResetPassword: {
      type: Boolean,
      default: false,
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
    avatar: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.password;
        return ret;
      },
    },
    toObject: {
      transform: function (doc, ret) {
        delete ret.password;
        return ret;
      },
    },
  }
);

// Hash password before saving if modified
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }

  // If already bcrypt hashed, skip rehashing
  if (this.password.startsWith('$2a$') || this.password.startsWith('$2b$')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to compare candidate password
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.models.User || mongoose.model('User', userSchema);
