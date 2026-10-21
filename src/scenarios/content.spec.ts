import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('keeps scenarios in file name order (01-..., 02-...)', () => {
    const files = content.scenarios.map((s) => content.sourceFiles.get(s.id));
    expect(files).toEqual([...files].sort());
  });

  for (const scenario of content.scenarios) {
    const sourceFile = content.sourceFiles.get(scenario.id) ?? '';

    it(`${scenario.id}: file lives in scenarios/${scenario.packId}/`, () => {
      expect(sourceFile.startsWith(`scenarios/${scenario.packId}/`)).toBe(true);
    });

    it(`${scenario.id}: keeps the step visuals from the file`, () => {
      const raw = JSON.parse(readFileSync(join(CONTENT_DIR, sourceFile), 'utf8')) as {
        steps: Array<{ visual?: unknown }>;
      };
      expect(scenario.steps.map((s) => s.visual)).toEqual(raw.steps.map((s) => s.visual));
    });

    for (const step of scenario.steps) {
      it(`${scenario.id} / ${step.id}: expected response scores 100`, () => {
        const result = scoreTransmission(step, { transcript: step.expectedPilotResponse });
        expect(result.missedCritical).toEqual([]);
        expect(result.elements.filter((e) => e.status !== 'matched')).toEqual([]);
        expect(result.score).toBe(100);
      });

      if (step.atcAudio) {
        // The frontend serves ATC audio from public/audio/atc/<scenarioId>/<stepId>.mp3.
        it(`${scenario.id} / ${step.id}: atcAudio follows the path convention`, () => {
          expect(step.atcAudio).toBe(`/audio/atc/${scenario.id}/${step.id}.mp3`);
        });
      }
    }
  }
});
