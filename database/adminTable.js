import mongoose from "mongoose";

const adminSchema = new mongoose.Schema({
    userName: { type: String, required: true, unique: true },
    userPassword: { type: String, required: true },

    // Role of admin (super_admin, moderator, support, etc.)
    role: { type: String, default: "support" },

    // Permissions array (each page/action = one permission)
    permissions: {
        type: [String],
        default: [] // e.g. ["dashboard", "inbox", "requests"]
    }
}, { timestamps: true }
);

const AdminTable = mongoose.model("AdminTable", adminSchema);

export default AdminTable;
