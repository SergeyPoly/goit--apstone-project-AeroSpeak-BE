import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CALLSIGN_ID, expandToSpoken, orderRuleFor, scoreTransmission } from '../scoring';
import { loadContent } from './content-loader';
import { atcAudioPath } from './variants';
import type { Scenario } from './scenario.schema';
import { CONTENT_DIR } from './scenarios.service';

/**
 * Validates the real /content folder in CI, and checks that every step's
 * expected response, said in ICAO phraseology, gets a perfect score from the
 * scoring engine. If the expected phrase and the accepted variants disagree,
 * this test catches it.
 */
const content = loadContent(CONTENT_DIR);

/** VFR reporting points per aerodrome, from content/aerodromes/<ICAO>.json. */
const vfrPoints = (icao: string) =>
  content.aerodromes.get(icao)?.vfrPoints.map((p) => p.name) ?? [];

const aircraft = JSON.parse(readFileSync(join(CONTENT_DIR, 'aircraft.json'), 'utf8')) as Array<{
  registration: string;
  type: string;
}>;

/** Names a template must not contain as literals: they come from the aerodrome and aircraft data. */
const hardCodedFacts = [
  ...new Set([
    ...[...content.aerodromes.values()].flatMap((a) => [
      a.icao,
      a.name,
      ...a.city,
      a.chart.section,
      ...Object.values(a.stations).flatMap((s) => [...s.name, s.frequency]),
      ...a.vfrPoints.map((p) => p.name),
      ...Object.values(a.arrivals).flatMap((r) => (r.waypoint ? [r.waypoint] : [])),
    ]),
    ...aircraft.flatMap((a) => [a.registration, a.type]),
  ]),
];

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stringsOf = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(stringsOf)
      : value && typeof value === 'object'
        ? Object.values(value).flatMap(stringsOf)
        : [];

describe('scenario content', () => {
  it('loads packs and scenarios', () => {
    expect(content.packs.length).toBeGreaterThan(0);
    expect(content.scenarios.length).toBeGreaterThan(0);
  });

  it('keeps scenarios in file name order (01-..., 02-...)', () => {
    const files = content.scenarios.map((s) => content.sourceFiles.get(s.id));
    expect(files).toEqual([...files].sort());
  });

  for (const defaultScenario of content.scenarios) {
    const sourceFile = content.sourceFiles.get(defaultScenario.id) ?? '';

    it(`${defaultScenario.id}: file lives in scenarios/${defaultScenario.packId}/`, () => {
      expect(sourceFile.startsWith(`scenarios/${defaultScenario.packId}/`)).toBe(true);
    });

    it(`${defaultScenario.id}: keeps the step visual fields from the file`, () => {
      const raw = JSON.parse(readFileSync(join(CONTENT_DIR, sourceFile), 'utf8')) as {
        steps: Array<{ visual?: object }>;
      };
      const fields = (visual?: object) => Object.keys(visual ?? {}).sort();
      expect(defaultScenario.steps.map((s) => fields(s.visual))).toEqual(
        raw.steps.map((s) => fields(s.visual)),
      );
    });

    // Templates name aerodrome and aircraft facts only through placeholders, so a scenario
    // fits every aerodrome and aircraft it is rendered for.
    const raw = JSON.parse(readFileSync(join(CONTENT_DIR, sourceFile), 'utf8')) as {
      title: string;
      objective: string;
      variants?: { aerodromes?: string[]; aircraft?: boolean };
    };
    if (raw.variants?.aerodromes || raw.variants?.aircraft) {
      it(`${defaultScenario.id}: no hard-coded aerodrome or aircraft facts`, () => {
        const { variants: _variants, ...template } = raw;
        const texts = stringsOf(template);
        const found = hardCodedFacts.filter((fact) =>
          texts.some((text) =>
            new RegExp(`(^|[^\\p{L}])${escape(fact)}($|[^\\p{L}])`, 'u').test(text),
          ),
        );
        expect(found).toEqual([]);
      });

      // The scenario list shows the default variant: title and objective must fit every variant.
      it(`${defaultScenario.id}: title and objective have no placeholders`, () => {
        expect(`${raw.title} ${raw.objective}`).not.toMatch(/\{\{/);
      });
    }

    // Every variant (aerodrome, weather, aircraft) is checked like a scenario of its own.
    const variantSet = content.variants.get(defaultScenario.id);
    for (const key of variantSet?.keys ?? []) {
      const scenario = variantSet?.byKey.get(key) ?? defaultScenario;
      const name = key ? `${scenario.id} [${key}]` : scenario.id;
      checkScenario(name, scenario);
    }
  }
});

function checkScenario(name: string, scenario: Scenario) {
  const airport = scenario.briefing?.find((b) => b.label === 'Airport')?.value.slice(0, 4);
  for (const step of scenario.steps) {
    if (step.visual?.kind === 'airspace') {
      const { point } = step.visual;
      it(`${name} / ${step.id}: airspace point is a VFR point of ${airport}`, () => {
        expect(vfrPoints(airport ?? '')).toContain(point);
      });
    }

    it(`${name} / ${step.id}: expected response scores 100`, () => {
      // What a pilot says: "SP-TFA" -> "sierra papa tango foxtrot alpha", "QNH 998" -> "qnh niner niner eight".
      const [spoken] = expandToSpoken(step.expectedPilotResponse);
      const result = scoreTransmission(step, { transcript: spoken.map((w) => w.word).join(' ') });
      expect(result.missedCritical).toEqual([]);
      expect(result.elements.filter((e) => e.status !== 'matched')).toEqual([]);
      expect(result.score).toBe(100);
    });

    // Doc 9432 2.4.2: "FL 95" is "flight level niner five", without a leading zero.
    it(`${name} / ${step.id}: flight levels have no leading zero`, () => {
      const texts = [
        step.visual?.kind === 'text' ? step.visual.text : '',
        step.prompt,
        step.atcText ?? '',
        step.expectedPilotResponse,
        ...step.requiredElements.flatMap((e) => [e.label, ...e.acceptedVariants]),
      ];
      const zeroLevels = texts.flatMap((t) => t.match(/\b(?:FL|flight level)\s*0\d/gi) ?? []);
      expect(zeroLevels).toEqual([]);
    });

    if (orderRuleFor(step) === 'readback') {
      // A readback puts the callsign at the start or at the end, never in the middle.
      it(`${name} / ${step.id}: readback callsign is first or last`, () => {
        const ids = step.requiredElements.map((e) => e.id);
        expect([ids[0], ids.at(-1)]).toContain(CALLSIGN_ID);
      });
    }

    // AIP Polska GEN 1.7: no "to" right before a number ("to" sounds like "two").
    it(`${name} / ${step.id}: no "to" before a number`, () => {
      const texts = [step.atcText ?? '', step.expectedPilotResponse];
      const toBeforeNumber = texts.flatMap((t) => t.match(/\bto \d/gi) ?? []);
      expect(toBeforeNumber).toEqual([]);
    });

    if (step.atcAudio) {
      // The frontend serves ATC audio from public/audio/atc/<hash of atcText>.mp3.
      it(`${name} / ${step.id}: atcAudio follows the path convention`, () => {
        expect(step.atcAudio).toBe(atcAudioPath(step.atcText ?? ''));
      });
    }
  }
}
