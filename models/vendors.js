import mongoose from "mongoose";

// Define the schema
const userSchema = new mongoose.Schema({

    // basic
    name: { type: String },
    email: { type: String, unique: true },
    phone: { type: Number, unique: true },
    password: { type: String },
    loginMethod: { type: String },
    entry_Time: { type: Date, default: Date.now },

    // Additional profile fields
    firstName: { type: String },
    lastName: { type: String },
    profilePic: { type: String },
    addressLine1: { type: String },
    addressLine2: { type: String },
    city: { type: String },
    state: { type: String },
    country: { type: String },
    pincode: { type: String },
    bio: {
        type: String,
        default:
            "Passionate about creating memorable experiences for every occasion.\n" +
            "Dedicated to providing quality service and attention to detail.\n" +
            "Your satisfaction is my top priority — let's make your event special.\n" +
            "Book with confidence and enjoy a seamless experience!",
    },
    // ✅ Qualities: array of strings
    qualities: {
        type: [String],
        default: [],
    },


    // service related
    rating: { type: Number, default: 0 },
    lastRatedAt: { type: Date },
    totalVisitors: { type: Number, default: 0 },
    avgTrendPercent: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },


}, {
    timestamps: true, // ✅ adds createdAt & updatedAt
});

// Create the model for the user collection
const Vendor = mongoose.model('Vendor', userSchema);

export default Vendor;
