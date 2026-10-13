import { scoreTransmission } from '../scoring';
import { loadContent } from './content-loader';
import { CONTENT_DIR } from './scenarios.service';

/**
 * Validates the real /content folder in CI, and checks that every step's
 * expected response gets a perfect score from the scoring engine. If the
 * expected phrase and the accepted variants disagree, this test catches it.
 */
describe('scenario content', () => {
  const content = loadContent(CONTENT_DIR);

  it('loads packs and scenarios', () => {
    expect(content.packs.length).toBeGreaterThan(0);
    expect(content.scenarios.length).toBeGreaterThan(0);
  });

  for (const scenario of content.scenarios) {
    for (const step of scenario.steps) {
      it(`${scenario.id} / ${step.id}: expected response scores 100`, () => {
        const result = scoreTransmission(step, { transcript: step.expectedPilotResponse });
        expect(result.missedCritical).toEqual([]);
        expect(result.elements.filter((e) => e.status !== 'matched')).toEqual([]);
        expect(result.score).toBe(100);
      });
    }
  }
});
