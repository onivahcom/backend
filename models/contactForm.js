import mongoose from "mongoose";
// Define the schema for the contact form
const contactSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        match: [/.+@.+\..+/, 'Please enter a valid email address.'],
    },
    phoneNumber: {
        type: String,
        required: true,
    },
    eventType: {
        type: String,
        required: true,
    },
    message: {
        type: String,
    },
    isRead: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

// Create the model
const ContactForm = mongoose.model('ContactForm', contactSchema);

export default ContactForm;
