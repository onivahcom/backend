import RequestedService from "../models/RequestedService.js";

export const getLocationBasedServices = async (req, res) => {
    const { nearbyCounties = [], stateDistrict, page } = req.body;

    try {
        let services = [];
        const isLocationServices = page === "LOCATION_SERVICES";
        const limit = isLocationServices ? 0 : 3; // 0 means "no limit" in Mongo queries

        // Step 1: Search nearby counties
        if (nearbyCounties.length > 0) {
            const regexCounties = nearbyCounties.map(name => new RegExp(`^${name}$`, 'i'));
            services = await RequestedService.find({
                isApproved: true,
                'additionalFields.availableLocations': { $in: regexCounties }
            }).limit(limit || undefined); // undefined = no limit
        }

        // Step 2: Fallback to state district
        if (!services.length && stateDistrict) {
            const regexState = new RegExp(`^${stateDistrict}$`, 'i');
            services = await RequestedService.find({
                isApproved: true,
                'additionalFields.availableLocations': regexState
            }).limit(limit || undefined);
        }

        if (!services.length) {
            return res.status(404).json({ message: 'No services available near your location.' });
        }

        return res.json({ services });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

