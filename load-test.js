import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export let options = {
  stages: [
    { duration: '2m', target: 10 }, // Ramp up to 10 users
    { duration: '5m', target: 10 }, // Stay at 10 users
    { duration: '2m', target: 50 }, // Ramp up to 50 users
    { duration: '5m', target: 50 }, // Stay at 50 users
    { duration: '2m', target: 100 }, // Ramp up to 100 users
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.1'], // Less than 10% errors
    errors: ['rate<0.1'], // Less than 10% custom errors
  },
};

const BASE_URL = 'http://localhost:3000';

export function setup() {
  // Create test data setup
  console.log('Setting up load test...');
}

export default function () {
  // Test 1: Multiple agent registrations
  let agentRes = http.post(`${BASE_URL}/api/auth/register`, {
    email: `agent-${__VU}-${__ITER}@test.com`,
    name: `Test Agent ${__VU}`,
    role: 'agent',
    password: 'testpassword123',
  });

  let agentSuccess = check(agentRes, {
    'agent registration status is 200': r => r.status === 200,
    'agent registration response time < 500ms': r => r.timings.duration < 500,
  });

  errorRate.add(!agentSuccess);

  // Test 2: Multiple member registrations
  let memberRes = http.post(`${BASE_URL}/api/auth/register`, {
    email: `member-${__VU}-${__ITER}@test.com`,
    name: `Test Member ${__VU}`,
    role: 'member',
    password: 'testpassword123',
  });

  let memberSuccess = check(memberRes, {
    'member registration status is 200': r => r.status === 200,
    'member registration response time < 500ms': r => r.timings.duration < 500,
  });

  errorRate.add(!memberSuccess);

  // Test 3: Concurrent claim submissions
  let claimRes = http.post(
    `${BASE_URL}/api/claims`,
    {
      title: `Test Claim ${__VU}-${__ITER}`,
      description: 'This is a test claim created during load testing',
      category: 'test',
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session=${memberRes.json('session') || ''}`,
      },
    }
  );

  let claimSuccess = check(claimRes, {
    'claim creation status is 200 or 429': r => r.status === 200 || r.status === 429,
    'claim creation response time < 2000ms': r => r.timings.duration < 2000,
  });

  errorRate.add(!claimSuccess);

  // Test 4: Database connection stress test
  let dbRes = http.get(`${BASE_URL}/api/health`);

  let dbSuccess = check(dbRes, {
    'database health check status is 200': r => r.status === 200,
    'database response time < 100ms': r => r.timings.duration < 100,
  });

  errorRate.add(!dbSuccess);

  sleep(1);
}

export function teardown() {
  console.log('Load test completed');
}
