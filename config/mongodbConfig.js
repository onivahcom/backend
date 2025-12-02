import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
import dns from "dns"

// MongoDB URI from environment variable
const MONGODB_URI = process.env.MONGODB_URI;

dns.setServers(['8.8.8.8', '8.8.4.4', '0.0.0.0']); // Set DNS servers for MongoDB connection


// Connect to MongoDB and create a collection (if it doesn't exist)
const connectDB = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Mongoose connected");

    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
    }
};


export default connectDB;
