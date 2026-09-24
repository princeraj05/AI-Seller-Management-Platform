import mongoose from 'mongoose';

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
      required: false, // Optional if authenticated via Firebase
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
  }
);

export const User = mongoose.models.User || mongoose.model('User', userSchema);
