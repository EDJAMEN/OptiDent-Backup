// Seed Super Admin directly in MongoDB
db = db.getSiblingDB('OptiDent');

const count = db.users.countDocuments({ email: 'superadmin@optident.com' });
if (count > 0) {
    db.users.deleteMany({ email: 'superadmin@optident.com' });
}

db.users.insertOne({
    full_name: 'Dr. Super Admin',
    email: 'superadmin@optident.com',
    phone: '09171234567',
    password_hash: '$2y$10$7iSGt9jApMjL7H4BHBZ08eK92aLEDFFGRWDKXCZM48VIX3/Rq.W0O',
    role: 'super_admin',
    status: 'active',
    is_master: true,
    is_active: true,
    professional_id: 'SA-001-LICENSE',
    position: 'Chief Executive Dental Officer',
    dob: '1985-05-15',
    emergency_contact_name: 'Clinic Hotline',
    emergency_contact_phone: '09179998888',
    allergies: 'None',
    medications: 'None',
    reward_points: 0,
    created_at: new Date()
});

print("Super Admin seeded in OptiDent.users successfully!");
