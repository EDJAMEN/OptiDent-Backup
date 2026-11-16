import { autoCreateGoogleCalendarEvent } from './api/config/googleCalendar.js';
import dotenv from 'dotenv';
dotenv.config();

async function testCal() {
  console.log('--- Testing Google Calendar API Auto-Sync ---');
  console.log('Target Calendar: optidentt@gmail.com\n');

  const apptDetails = {
    id: 'test_auto_' + Date.now(),
    service_name: 'Diagnostic Oral Consultation (Test Sync)',
    doctor_name: 'Dr. Maria Santos',
    patient_name: 'oniichan ejmn',
    patient_email: 'oniichanejmn@gmail.com',
    date: new Date().toISOString().slice(0, 10),
    time: '02:00 PM',
    operatory_chair: 'Operatory Chair 1',
    notes: 'Direct API test event - Automatic zero-click sync'
  };

  const res = await autoCreateGoogleCalendarEvent(apptDetails);
  console.log('Result:', JSON.stringify(res, null, 2));

  if (res.success) {
    console.log('\n SUCCESS! Event created on Google Calendar!');
    console.log('Event Link:', res.htmlLink);
  } else if (!res.configured) {
    console.log('\n NOT YET CONFIGURED: ' + res.reason);
  } else {
    console.log('\n FAILED: ' + res.error);
    if (res.error && res.error.includes('Not Found')) {
      console.log('TIP: Please share your Google Calendar (optidentt@gmail.com) with the Service Account email and grant "Make changes to events" permission.');
    }
  }
}

testCal().catch(console.error);

