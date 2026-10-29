import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expandToSpoken, scoreTransmission } from '../scoring';
import { loadContent } from './content-loader';
import { CONTENT_DIR } from './scenarios.service';

/**
 * Validates the real /content folder in CI, and checks that every step's
 * expected response, said in ICAO phraseology, gets a perfect score from the
 * scoring engine. If the expected phrase and the accepted variants disagree,
 * this test catches it.
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
        // What a pilot says: "SP-TFA" -> "sierra papa tango foxtrot alpha", "QNH 998" -> "qnh niner niner eight".
        const [spoken] = expandToSpoken(step.expectedPilotResponse);
        const result = scoreTransmission(step, { transcript: spoken.map((w) => w.word).join(' ') });
        expect(result.missedCritical).toEqual([]);
        expect(result.elements.filter((e) => e.status !== 'matched')).toEqual([]);
        expect(result.score).toBe(100);
      });

      // Team rule: a flight level is written with three digits everywhere the user sees
      // or says it ("FL 065", not "FL 65").
      it(`${scenario.id} / ${step.id}: writes flight levels with three digits`, () => {
        const texts = [
          step.visual?.kind === 'text' ? step.visual.text : '',
          step.prompt,
          step.atcText ?? '',
          step.expectedPilotResponse,
          ...step.requiredElements.flatMap((e) => [e.label, ...e.acceptedVariants]),
        ];
        const shortLevels = texts.flatMap(
          (t) => t.match(/\b(?:FL|flight level)\s*\d{1,2}\b/gi) ?? [],
        );
        expect(shortLevels).toEqual([]);
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
