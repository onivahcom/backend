import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import path from 'path';
import { fileURLToPath } from 'url';

const analyticsData = google.analyticsdata('v1beta');
// Resolve path for service account key
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KEY_PATH = path.join(__dirname, '..', 'config', 'googleAnalytics.json');

// Auth setup
const auth = new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
});


const propertyId = 'properties/438934355'; // Replace with actual property ID

const fetchPageVisits = async () => {
    try {
        const authClient = await auth.getClient();

        const res = await analyticsData.properties.runReport({
            auth: authClient,
            property: propertyId,
            requestBody: {
                dimensions: [{ name: 'pagePath' }, { name: 'country' }],
                metrics: [{ name: 'screenPageViews' }],
                dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
            },
        });

        const rows = res.data.rows || [];

    } catch (error) {
        console.error('❌ Failed to fetch analytics data:', error.message);
    }
};




export default fetchPageVisits;