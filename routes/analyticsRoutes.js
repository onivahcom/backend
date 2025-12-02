import express from "express";
import { endUserSession, getVendorAnalytics, getVisitorsChart, guestLink, trackUserVisit } from "../controllers/analyticsController.js";

const analyticsRouter = express.Router();

analyticsRouter.post("/track-visit", trackUserVisit);
analyticsRouter.post("/end-session", endUserSession);
analyticsRouter.post("/link-guest", guestLink);

// vendor
analyticsRouter.get("/:vendorId", getVendorAnalytics);

// get visitors chart
analyticsRouter.get("/:vendorId/visitors", getVisitorsChart);


export default analyticsRouter;
