import { expect, test as authTest } from '../fixtures/auth.fixture';
import type {
  InformationRequestReadSeam,
  ReadSeamCounts,
  ReadSeamPhase,
} from './information-request-read-result.fixture';
import { waitForReadSignal } from './information-request-read-signals.fixture';

export const READ_RECOVERY_TIMEOUT_MS = 180_000;
const CLEANUP_RESERVE_MS = 60_000;

export type ExpectRead = (
  seam: InformationRequestReadSeam,
  label: string,
  matches: (counts: ReadSeamCounts) => boolean,
  phase?: ReadSeamPhase
) => Promise<void>;

export const test = authTest.extend<{ expectRead: ExpectRead }>({
  expectRead: [
    async ({}, use) => {
      // Start before the authenticated page and claim fixtures consume the test budget.
      const deadline = performance.now() + READ_RECOVERY_TIMEOUT_MS - CLEANUP_RESERVE_MS;
      await use((seam, label, matches, phase = 'settled') =>
        test.step(label, async () => {
          const arrived = await waitForReadSignal(seam.waitForRead(phase), deadline);
          seam.assertNoError();
          expect(arrived, `${label} (${phase} read signal timed out)`).toBe(true);
          const counts = seam.counts();
          expect(matches(counts), `${label} (${JSON.stringify(counts)})`).toBe(true);
        })
      );
    },
    { auto: true },
  ],
});
