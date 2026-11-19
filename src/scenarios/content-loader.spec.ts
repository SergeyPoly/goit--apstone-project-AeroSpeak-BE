import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadContent } from './content-loader';
import { atcAudioPath } from './variants';

const SCENARIO = 'scenarios/arrival-controlled/01-ctr-entry.json';
const READBACK = 'entry-readback';
const REQUEST = 'initial-call';

type RawStep = Record<string, unknown> & { id: string };
type RawScenario = { id: string; steps: RawStep[] };

describe('content loader: ATC corrections', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aerospeak-content-'));
    cpSync(join(__dirname, '../../content'), dir, { recursive: true });
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** Rewrites one step of the test scenario, then loads the whole content folder. */
  const loadWithStep = (stepId: string, change: (step: RawStep) => void) => {
    const file = join(dir, SCENARIO);
    const scenario = JSON.parse(readFileSync(file, 'utf8')) as RawScenario;
    const step = scenario.steps.find((s) => s.id === stepId);
    if (!step) throw new Error(`no step ${stepId}`);
    change(step);
    writeFileSync(file, JSON.stringify(scenario));
    return () => loadContent(dir);
  };

  it('keeps an authored correction and derives its audio', () => {
    const content = loadWithStep(READBACK, (step) => {
      step.atcCorrection = '{{callsign}}, negative, I say again, report entering the zone.';
    })();
    const scenario = content.scenarios.find((s) => s.id === 'arr-ctrl-ctr-entry');
    const step = scenario?.steps.find((s) => s.id === READBACK);

    expect(step?.atcCorrection).toMatch(/^\S+, negative, I say again, report entering the zone\.$/);
    expect(step?.atcCorrectionAudio).toBe(atcAudioPath(step?.atcCorrection ?? ''));
  });

  it('rejects a hand-written correction audio path', () => {
    const load = loadWithStep(READBACK, (step) => {
      step.atcCorrectionAudio = '/audio/atc/0000000000000000.mp3';
    });

    expect(load).toThrow('atcCorrectionAudio is derived from atcCorrection');
  });

  it('rejects a correction on a step that is not a readback', () => {
    const load = loadWithStep(REQUEST, (step) => {
      step.atcCorrection = '{{callsign}}, negative.';
    });

    expect(load).toThrow('only readback steps get a correction');
  });

  it('rejects a readback whose correction cannot be derived', () => {
    const load = loadWithStep(READBACK, (step) => {
      step.atcText = `{{tower}}, ${String(step.atcText)}`;
    });

    expect(load).toThrow('no ATC correction');
  });
});
