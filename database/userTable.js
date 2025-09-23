import mongoose from "mongoose";

// Define the schema
const userSchema = new mongoose.Schema({
    firstname: { type: String, },  // User's name (required)
    lastname: { type: String, },  // User's name (required)
    email: { type: String, unique: true },  // User's email (required and unique)
    phone: { type: String, unique: true },  // Phone number
    password: { type: String, },  // User's password
    DOB: { type: String },  // Date of Birth (optional)
    loginMethod: { type: String },  // Login method (Google, Facebook, etc.)
    entry_Time: { type: Date, default: Date.now },  // Auto-generated entry time
    userId: { type: String, unique: true },  // id
    country: { type: String },  // User's country
    state: { type: String },  // User's state
    city: { type: String },  // User's city
    zipcode: { type: String },  // User's zipcode
    profilePic: { type: String }, // <- make sure this is present

});

// Create the model for the user collection
const userTable = mongoose.model('userTables', userSchema);

export default userTable;
