#!/usr/bin/env tsx
import 'dotenv/config';
import { sendStatusChangedEmail } from '../src/lib/email';

async function testEmail() {
  console.log('🧪 Testing Resend Email Integration...\n');

  // Test data
  const testData = {
    to: 'arben@interdomestik.com', // Change this to your email
    claim: {
      id: 'test-claim-123',
      title: 'Test Claim - Vehicle Damage',
    },
    oldStatus: 'submitted',
    newStatus: 'verification',
  };

  try {
    console.log('📧 Sending test email to:', testData.to);
    console.log('Claim:', testData.claim.title);
    console.log('Status:', `${testData.oldStatus} → ${testData.newStatus}\n`);

    const result = await sendStatusChangedEmail(
      testData.to,
      testData.claim,
      testData.oldStatus,
      testData.newStatus
    );

    if (result.success) {
      console.log('✅ Email sent successfully!');
      console.log('Email ID:', result.id);
      console.log('\n📬 Check your inbox:', testData.to);
    } else {
      console.error('❌ Email failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testEmail();
