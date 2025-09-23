import express from "express";
import googleLogin from "../controllers/authController.js";

const router = express.Router();

router.get("/google", (req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");

    // Log to check if headers are being applied
    console.log("COOP/COEP Headers applied to /google");

    next(); // Proceed to the googleLogin handler
}, googleLogin);

// router.get("/google", googleLogin)

export default router; // Ensure you export the router
