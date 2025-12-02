// import { ServicePricingConfig } from "../models/ServicePricingConfig.js";

// export const calculateDynamicPricing = async ({
//     minPrice,
//     maxPrice,
//     occupancyRate = 0,
//     dayOfWeek,
//     daysBeforeEvent,
//     vendorRating = 4,
//     location,
//     bookingTime,
//     category
// }) => {
//     const now = new Date();
//     if (!bookingTime) {
//         bookingTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
//     }

//     let weight = Math.max(0, Math.min(1, 1 - daysBeforeEvent / 30));
//     let basePrice = minPrice + (maxPrice - minPrice) * weight;

//     if (occupancyRate > 0.8) basePrice *= 1.2;

//     // ✅ Fetch category config dynamically
//     const config = await ServicePricingConfig.findOne({ category })
//         .sort({ createdAt: -1 }) //  Get latest created config
//         .lean();

//     const peakDays = config?.peakDays || [];
//     const peakMonths = config?.peakMonths || [];
//     const specialDates = config?.specialDates || [];
//     const highDemandLocations = config?.highDemandLocations || [];

//     const bookingDate = new Date();
//     const bookingMonth = bookingDate.toLocaleString("en-US", { month: "long" });
//     const formattedDate = bookingDate.toISOString().split("T")[0];

//     // ✅ Dynamic checks
//     if (
//         peakDays.includes(dayOfWeek) ||
//         peakMonths.includes(bookingMonth) ||
//         specialDates.includes(formattedDate)
//     ) basePrice *= 1.15;

//     if (daysBeforeEvent < 3) basePrice *= 1.25;
//     else if (daysBeforeEvent > 30) basePrice *= 0.9;

//     if (vendorRating > 4.5) basePrice *= 1.1;
//     else if (vendorRating < 3.5) basePrice *= 0.9;

//     if (highDemandLocations.includes(location)) basePrice *= 1.1;

//     const hour = new Date(bookingTime).getHours();
//     if (hour >= 22 || hour <= 6) basePrice *= 0.95;

//     return Math.round(Math.min(Math.max(basePrice, minPrice), maxPrice));
// };

import { ServicePricingConfig } from "../models/ServicePricingConfig.js";

export const calculateDynamicPricing = async ({
    serviceId,
    minPrice,
    maxPrice,
    occupancyRate = 0,
    dayOfWeek,
    daysBeforeEvent,
    vendorRating = 3,
    location,
    bookingTime,
    category,
    trendAvg,
}) => {

    const now = new Date();
    if (!bookingTime) {
        bookingTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
    }

    // 🟦 1. Base Weight Pricing
    let weight = Math.max(0, Math.min(1, 1 - daysBeforeEvent / 30));

    let basePrice = minPrice + (maxPrice - minPrice) * weight;

    // 🟦 2. Occupancy Adjustment
    if (occupancyRate > 0.8) {
        basePrice *= 1.2;
    }

    // 🟦 3. Fetch Config
    const config = await ServicePricingConfig.findOne({ serviceId })
        .sort({ createdAt: -1 })
        .lean();

    const peakDays = config?.peakDays || [];
    const peakMonths = config?.peakMonths || [];
    const specialDates = config?.specialDates || [];
    const highDemandLocations = config?.highDemandLocations || [];

    // 🟦 4. Date-Based Modifiers
    const bookingDate = new Date();
    const bookingMonth = bookingDate.toLocaleString("en-US", { month: "long" });
    const formattedDate = bookingDate.toISOString().split("T")[0];

    if (
        peakDays.includes(dayOfWeek) ||
        peakMonths.includes(bookingMonth) ||
        specialDates.includes(formattedDate)
    ) {
        basePrice *= 1.15;
    }

    // 🟦 5. Days Before Event Rules
    if (daysBeforeEvent < 3) {
        basePrice *= 1.25;
    } else if (daysBeforeEvent > 30) {
        basePrice *= 0.9;
    }

    // 🟦 6. Vendor Rating Impact
    if (vendorRating > 4.5) {
        basePrice *= 1.1;
    } else if (vendorRating < 3.5) {
        basePrice *= 0.9;
    }

    // 🟦 7. Location Impact
    if (highDemandLocations.includes(location)) {
        basePrice *= 1.1;
    }

    // 🟦 8. Time of Day Adjustment
    const hour = new Date(bookingTime).getHours();
    if (hour >= 22 || hour <= 6) {
        basePrice *= 0.95;
    }

    // 🟦 9. Trend Impact
    if (trendAvg > 0) {
        basePrice *= 1 + Math.min(trendAvg / 100, 0.2);
    } else if (trendAvg < 0) {
        basePrice *= 1 + Math.max(trendAvg / 100, -0.2);
    }

    // 🟦 10. Final Clamp
    const finalPrice = Math.round(Math.min(Math.max(basePrice, minPrice), maxPrice));

    return finalPrice;
};
