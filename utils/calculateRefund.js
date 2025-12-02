export function calculateRefund(booking, policy) {
    const eventDate = booking.package.dates[0];
    const daysBefore = Math.floor((eventDate - new Date()) / (1000 * 60 * 60 * 24));

    const Policy = policy || "moderate";

    const rules = {
        flexible: [
            { minDays: 7, refund: 100 },
            { minDays: 3, refund: 100 },
            { minDays: 0, refund: 50 },
        ],
        moderate: [
            { minDays: 7, refund: 100 },
            { minDays: 3, refund: 50 },
            { minDays: 0, refund: 0 },
        ],
        strict: [
            { minDays: 7, refund: 50 },
            { minDays: 0, refund: 0 },
        ],
    };

    const selected = rules[Policy];
    for (const rule of selected) {
        if (daysBefore >= rule.minDays) {
            return (booking.amount * rule.refund) / 100;
        }
    }
    return 0;
}
