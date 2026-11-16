/**
 * OptiDent System - Clinical Service Pricing & Financial Helper
 */

export const SERVICE_PRICING = {
    'dental consultation & oral examination': 500,
    'dental consultation': 500,
    'consultation': 500,
    'oral examination': 500,
    'oral prophylaxis (dental cleaning)': 1200,
    'oral prophylaxis': 1200,
    'dental cleaning': 1200,
    'cleaning': 1200,
    'tooth restoration / light-cure composite filling': 1500,
    'tooth restoration': 1500,
    'composite filling': 1500,
    'tooth filling': 1500,
    'filling': 1500,
    'tooth extraction (simple)': 1000,
    'tooth extraction': 1000,
    'extraction': 1000,
    'surgical odontectomy (impacted wisdom tooth)': 7500,
    'surgical odontectomy': 7500,
    'wisdom tooth extraction': 7500,
    'odontectomy': 7500,
    'root canal therapy (endodontics)': 6000,
    'root canal therapy': 6000,
    'root canal': 6000,
    'endodontics': 6000,
    'teeth whitening / bleaching': 8000,
    'teeth whitening': 8000,
    'bleaching': 8000,
    'orthodontic bracket adjustment / braces': 1500,
    'orthodontic bracket adjustment': 1500,
    'orthodontics': 1500,
    'braces adjustment': 1500,
    'braces': 1500,
    'dental crown': 5000,
    'dental bridge': 8000,
    'dentures': 7000,
    'x-ray': 500,
    'panoramic x-ray': 1000
};

export function getServicePrice(serviceName, customPrice) {
    if (customPrice !== undefined && customPrice !== null && !isNaN(Number(customPrice)) && Number(customPrice) > 0) {
        return Number(customPrice);
    }
    const clean = String(serviceName || '').toLowerCase().trim();
    if (SERVICE_PRICING[clean]) return SERVICE_PRICING[clean];
    for (const [key, val] of Object.entries(SERVICE_PRICING)) {
        if (clean.includes(key) || key.includes(clean)) {
            return val;
        }
    }
    return 500; // Standard clinical consultation fee
}

export function formatPhp(amount) {
    const num = Number(amount) || 0;
    return '₱' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default {
    SERVICE_PRICING,
    getServicePrice,
    formatPhp
};

