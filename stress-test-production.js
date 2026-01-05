import http from 'k6/http';
import { check, sleep } from 'k6/metrics';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export let options = {
  stages: [
    { duration: '30s', target: 5 }, // Warm up
    { duration: '1m', target: 20 }, // Ramp up to 20 concurrent users
    { duration: '2m', target: 50 }, // Ramp up to 50 concurrent users
    { duration: '5m', target: 100 }, // Hold at 100 concurrent users
    { duration: '2m', target: 200 }, // Spike to 200 concurrent users
    { duration: '5m', target: 100 }, // Back to 100
    { duration: '2m', target: 0 }, // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests under 2s
    http_req_failed: ['rate<0.2'], // Less than 20% errors
    errors: ['rate<0.2'], // Less than 20% custom errors
  },
  discardResponseBodies: true,
  scenarioTimeout: '15m',
};

const BASE_URL = 'http://127.0.0.1:3000';

// Test data generators
function generateEmail() {
  return `test+${Date.now()}_${Math.random().toString(36).substr(2, 9)}@example.com`;
}

function generateName() {
  const firstNames = ['John', 'Jane', 'Bob', 'Alice', 'Charlie', 'Diana', 'Eve', 'Frank'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];
  return `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
}

// Test functions
export function setup() {
  console.log('🚀 Starting Stress Test for Interdomestik Production Readiness');
  console.log(`Target: ${BASE_URL}`);

  // Health check before test
  const healthCheck = http.get(`${BASE_URL}/api/health`);
  if (healthCheck.status !== 200) {
    throw new Error('Health check failed - application not ready');
  }

  console.log('✅ Application is ready for stress testing');
}

export default function () {
  const email = generateEmail();
  const name = generateName();

  // Test 1: Concurrent Agent Registration (25% of users)
  if (Math.random() < 0.25) {
    testAgentRegistration(email, name);
  }
  // Test 2: Concurrent Member Registration (50% of users)
  else if (Math.random() < 0.75) {
    testMemberRegistration(email, name);
  }
  // Test 3: Concurrent Claim Submission (25% of users)
  else {
    testClaimSubmission();
  }

  // Test 4: Health check monitoring (every 10 requests)
  if (__ITER % 10 === 0) {
    testHealthEndpoint();
  }

  sleep(Math.random() * 2); // 0-2s random delay
}

function testAgentRegistration(email, name) {
  const response = http.post(
    `${BASE_URL}/api/auth/register`,
    {
      email: email,
      name: name,
      role: 'agent',
      password: 'testpassword123',
      phone: `+${Math.floor(Math.random() * 9000000000) + 1000000000}`,
    },
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  const success = check(response, {
    'agent registration status is 200 or 429': r => r.status === 200 || r.status === 429,
    'agent registration response time < 5s': r => r.timings.duration < 5000,
  });

  errorRate.add(!success);

  if (response.status === 429) {
    console.log('Rate limit hit on agent registration - working as expected');
  }
}

function testMemberRegistration(email, name) {
  const response = http.post(
    `${BASE_URL}/api/auth/register`,
    {
      email: email,
      name: name,
      role: 'user',
      password: 'testpassword123',
      phone: `+${Math.floor(Math.random() * 9000000000) + 1000000000}`,
    },
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  const success = check(response, {
    'member registration status is 200 or 429': r => r.status === 200 || r.status === 429,
    'member registration response time < 5s': r => r.timings.duration < 5000,
  });

  errorRate.add(!success);

  if (response.status === 429) {
    console.log('Rate limit hit on member registration - working as expected');
  }
}

function testClaimSubmission() {
  const response = http.post(
    `${BASE_URL}/api/claims`,
    {
      title: `Stress Test Claim ${Date.now()}`,
      description: 'This is a stress test claim for production readiness testing',
      category: 'general',
    },
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  const success = check(response, {
    'claim submission status is 200 or 401 or 429': r =>
      r.status === 200 || r.status === 401 || r.status === 429,
    'claim submission response time < 3s': r => r.timings.duration < 3000,
  });

  errorRate.add(!success);
}

function testHealthEndpoint() {
  const response = http.get(`${BASE_URL}/api/health`);

  const success = check(response, {
    'health check status is 200': r => r.status === 200,
    'health check response time < 500ms': r => r.timings.duration < 500,
    'health check returns proper structure': r => {
      try {
        const body = JSON.parse(r.body);
        return body.status && body.timestamp && body.services;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);

  if (!success) {
    console.error('Health check failed during stress test:', response.status, response.body);
  }
}

export function teardown() {
  console.log('🎯 Stress Test Complete');
  console.log('Checking application stability...');

  const finalHealthCheck = http.get(`${BASE_URL}/api/health`);
  if (finalHealthCheck.status === 200) {
    console.log('✅ Application remained stable during stress test');
  } else {
    console.error('❌ Application became unstable during stress test');
  }
}
