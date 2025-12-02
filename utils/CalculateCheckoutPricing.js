

// utils/calculatePrice.js

export function calculateCheckoutPricing(serviceDetails, daysCount = 1) {
    if (!serviceDetails?.package?.price || !serviceDetails?.package?.pricingType) {
        return {
            basePrice: 0,
            platformFee: 0,
            guestFee: 0,
            vendorReceives: 0,
            totalPrice: 0,
            formatted: {}
        };
    }

    const { price, pricingType } = serviceDetails.package;
    let baseTotal = price || 0;
    const category = serviceDetails?.category || "";

    // 1️⃣ Calculate base total depending on pricing type
    switch (pricingType) {
        case "perHour":
            baseTotal = daysCount * 24 * price;
            break;
        case "perDay":
            baseTotal = daysCount * price;
            break;
        case "perEvent":
        case "package":
            baseTotal = price;
            break;
        default:
            baseTotal = 0;
    }

    // 2️⃣ Fees
    const PLATFORM_COMMISSION_RATE = 0.10; // 10% from vendor
    let GUEST_SERVICE_FEE_RATE = 0.04; // default

    if (/photography|videography/i.test(category)) {
        GUEST_SERVICE_FEE_RATE = 0.03;
    } else if (/hall|venue/i.test(category)) {
        GUEST_SERVICE_FEE_RATE = 0.07;
    } else if (/catering|decoration|makeup|dj|mehndi|music/i.test(category)) {
        GUEST_SERVICE_FEE_RATE = 0.05;
    }

    const platformFee = baseTotal * PLATFORM_COMMISSION_RATE;
    const guestFee = baseTotal * GUEST_SERVICE_FEE_RATE;
    const vendorReceives = baseTotal - platformFee;
    const totalPrice = baseTotal + guestFee;

    const formatINR = (value) => new Intl.NumberFormat("en-IN").format(value);

    return {
        basePrice: baseTotal,
        platformFee,
        guestFee,
        vendorReceives,
        totalPrice,
        formatted: {
            basePrice: formatINR(baseTotal),
            platformFee: formatINR(platformFee),
            guestFee: formatINR(guestFee),
            vendorReceives: formatINR(vendorReceives),
            totalPrice: formatINR(totalPrice),
        }
    };
}
