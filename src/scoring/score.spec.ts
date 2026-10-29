import { CRITICAL_MISS_CAP, scoreTransmission, toDisplayScore } from './score';
import type { ScoringStep } from './types';

/** Taxi clearance readback from the spec (section 14). */
const taxiReadback: ScoringStep = {
  type: 'pilot_readback',
  expectedPilotResponse:
    'Taxi to holding point runway 21 via Alpha, Bravo, hold short runway 21, SP-TFA.',
  requiredElements: [
    {
      id: 'taxi_to_holding_point',
      label: 'Taxi to holding point runway 21',
      acceptedVariants: ['taxi to holding point runway 21', 'taxi holding point runway 21'],
      weight: 20,
    },
    {
      id: 'route_alpha_bravo',
      label: 'Via Alpha, Bravo',
      acceptedVariants: ['via Alpha Bravo', 'via Alpha, Bravo'],
      weight: 20,
    },
    {
      id: 'hold_short',
      label: 'Hold short runway 21',
      acceptedVariants: [
        'hold short runway 21',
        'hold short of runway 21',
        'holding short runway 21',
      ],
      weight: 35,
      critical: true,
    },
    {
      id: 'callsign',
      label: 'SP-TFA',
      acceptedVariants: ['SP-TFA', 'Sierra Papa Tango Foxtrot Alpha'],
      weight: 25,
      critical: true,
    },
  ],
  criticalElements: ['hold_short', 'callsign'],
};

/** Frequency readback, a typical basic drill. */
const frequencyDrill: ScoringStep = {
  type: 'basic_drill',
  expectedPilotResponse: 'Contact Ground on 121.900, SP-TFA',
  requiredElements: [
    { id: 'station', label: 'Contact Ground', acceptedVariants: ['contact ground'], weight: 30 },
    {
      id: 'frequency',
      label: '121.900',
      acceptedVariants: ['121.900'],
      weight: 50,
      critical: true,
    },
    { id: 'callsign', label: 'SP-TFA', acceptedVariants: ['SP-TFA'], weight: 20 },
  ],
};

/** One-element drill, like the alphabet, numbers and circuit position drills. */
const drill = (variants: string[], critical = false): ScoringStep => ({
  type: 'basic_drill',
  expectedPilotResponse: variants[0],
  requiredElements: [
    { id: 'item', label: variants[0], acceptedVariants: variants, weight: 100, critical },
  ],
});

const wordsOf = (result: ReturnType<typeof scoreTransmission>) =>
  result.elements.flatMap((e) => e.words.map((w) => `${w.expected}:${w.status}`));

describe('toDisplayScore', () => {
  it.each([
    [0, 1],
    [29, 1],
    [30, 2],
    [45, 3],
    [59, 3],
    [60, 4],
    [75, 5],
    [89, 5],
    [90, 6],
    [100, 6],
  ])('%i -> %i', (score, display) => {
    expect(toDisplayScore(score)).toBe(display);
  });
});

describe('scoreTransmission: taxi clearance readback', () => {
  it('gives 100 to a perfect readback in ICAO phraseology', () => {
    const result = scoreTransmission(taxiReadback, {
      transcript:
        'taxi to holding point runway two one via alpha bravo hold short runway two one sierra papa tango foxtrot alpha',
    });

    expect(result.elements.every((e) => e.status === 'matched')).toBe(true);
    expect(result.score).toBe(100);
    expect(result.success).toBe(true);
    expect(result.missedCritical).toEqual([]);
    expect(result.orderCorrect).toBe(true);
  });

  it('accepts digits when STT writes them', () => {
    const result = scoreTransmission(taxiReadback, {
      transcript:
        'taxi to holding point runway 21 via alpha bravo hold short of runway 21 sierra papa tango foxtrot alpha',
    });
    expect(result.success).toBe(true);
    expect(result.missedCritical).toEqual([]);
    expect(result.score).toBeGreaterThanOrEqual(95);
  });

  it('fails a readback without "hold short" and explains why', () => {
    const result = scoreTransmission(taxiReadback, {
      transcript:
        'taxi to holding point runway two one via alpha bravo sierra papa tango foxtrot alpha',
    });

    expect(result.missedCritical).toEqual(['hold_short']);
    expect(result.score).toBeLessThanOrEqual(CRITICAL_MISS_CAP);
    expect(result.success).toBe(false);
    expect(result.tip).toContain('Hold short runway 21');
    expect(result.tip).toContain('safety-critical');
  });

  it('treats a wrong runway number as missed, not as almost right', () => {
    const result = scoreTransmission(taxiReadback, {
      transcript:
        'taxi to holding point runway one two via alpha bravo hold short runway one two sierra papa tango foxtrot alpha',
    });

    const holdShort = result.elements.find((e) => e.id === 'hold_short');
    expect(holdShort?.status).toBe('missed');
    expect(result.success).toBe(false);
  });

  it('fails a callsign said as bare letters', () => {
    const result = scoreTransmission(taxiReadback, {
      transcript:
        'taxi to holding point runway two one via alpha bravo hold short runway two one s p t f a',
    });
    expect(result.missedCritical).toEqual(['callsign']);
    expect(result.success).toBe(false);
  });

  it('forgives an STT typo in a regular word', () => {
    const result = scoreTransmission(taxiReadback, {
      transcript:
        'taxi to holdin point runway two one via alpha bravo hold short runway two one sierra papa tango foxtrot alpha',
    });
    expect(result.elements.find((e) => e.id === 'taxi_to_holding_point')?.status).toBe('matched');
  });

  it('lowers the score when elements are out of order but still passes', () => {
    const inOrder = scoreTransmission(taxiReadback, {
      transcript:
        'taxi to holding point runway two one via alpha bravo hold short runway two one sierra papa tango foxtrot alpha',
    });
    const outOfOrder = scoreTransmission(taxiReadback, {
      transcript:
        'sierra papa tango foxtrot alpha hold short runway two one taxi to holding point runway two one via alpha bravo',
    });

    expect(outOfOrder.orderCorrect).toBe(false);
    expect(outOfOrder.score).toBeLessThan(inOrder.score);
    expect(outOfOrder.success).toBe(true);
  });

  it('gives zero for an unrelated transmission', () => {
    const result = scoreTransmission(taxiReadback, { transcript: 'request startup' });
    expect(result.score).toBe(0);
    expect(result.displayScore).toBe(1);
  });

  it('gives zero for an empty transcript', () => {
    const result = scoreTransmission(taxiReadback, { transcript: '' });
    expect(result.score).toBe(0);
    expect(result.success).toBe(false);
  });
});

describe('scoreTransmission: drills', () => {
  it('gives 100 to a correct word, whatever the STT confidence', () => {
    const result = scoreTransmission(drill(['downwind']), {
      transcript: 'downwind',
      words: [{ word: 'downwind', confidence: 0.68 }],
    });
    expect(result.score).toBe(100);
  });

  it('rejects a bare letter for a NATO word', () => {
    const result = scoreTransmission(drill(['Alpha', 'Alfa']), { transcript: 'a' });
    expect(result.score).toBe(0);
    expect(wordsOf(result)).toEqual(['alpha:missing']);
    expect(result.elements[0].words[0].heard).toBe('a');
  });

  it('accepts both spellings of Alpha', () => {
    expect(scoreTransmission(drill(['Alpha', 'Alfa']), { transcript: 'alfa' }).score).toBe(100);
  });

  it('accepts "three" for "tree": STT cannot tell them apart', () => {
    expect(scoreTransmission(drill(['3']), { transcript: 'three' }).score).toBe(100);
    expect(scoreTransmission(drill(['3']), { transcript: 'tree' }).score).toBe(100);
  });

  it('marks "nine" for "niner" as almost and tells the ICAO form', () => {
    const result = scoreTransmission(drill(['9']), { transcript: 'nine' });
    expect(wordsOf(result)).toEqual(['niner:almost']);
    expect(result.score).toBe(70);
    expect(result.success).toBe(true);
    expect(result.tip).toBe('Say "niner", not "nine": use the ICAO form.');
  });

  it('marks a wrong word that STT was unsure about as unclear, not wrong', () => {
    const result = scoreTransmission(drill(['9']), {
      transcript: 'minor',
      words: [{ word: 'minor', confidence: 0.4 }],
    });
    expect(result.elements[0].words[0]).toEqual({
      expected: 'niner',
      heard: 'minor',
      status: 'almost',
      unclear: true,
    });
    expect(result.tip).toContain('could not hear "niner" clearly');
  });

  it('does not excuse a bare letter by low confidence', () => {
    const result = scoreTransmission(drill(['Alpha', 'Alfa']), {
      transcript: 'a',
      words: [{ word: 'a', confidence: 0.46 }],
    });
    expect(wordsOf(result)).toEqual(['alpha:missing']);
    expect(result.score).toBe(0);
  });

  it('keeps a confident wrong word wrong', () => {
    const result = scoreTransmission(drill(['9']), {
      transcript: 'minor',
      words: [{ word: 'minor', confidence: 0.9 }],
    });
    expect(wordsOf(result)).toEqual(['niner:missing']);
    expect(result.score).toBe(0);
  });

  it('wants the leading zero of a flight level below 100', () => {
    const result = scoreTransmission(drill(['flight level 065']), {
      transcript: 'flight level six five',
    });
    expect(wordsOf(result)).toEqual([
      'flight:correct',
      'level:correct',
      'zero:missing',
      'six:correct',
      'fife:correct',
    ]);
    expect(result.elements[0].status).toBe('partial');
  });

  it.each(['squawk seven zero zero zero', 'squawk seven thousand'])(
    'accepts "%s" for squawk 7000',
    (transcript) => {
      expect(scoreTransmission(drill(['squawk 7000']), { transcript }).score).toBe(100);
    },
  );

  it.each(['heading three zero zero', 'heading three hundred'])(
    'accepts "%s" for heading 300',
    (transcript) => {
      expect(scoreTransmission(drill(['heading 300']), { transcript }).score).toBe(100);
    },
  );

  it('accepts an abbreviation spelled out by STT', () => {
    const result = scoreTransmission(drill(['QNH 1013'], true), {
      transcript: 'q n h one zero one three',
    });
    expect(result.score).toBe(100);
  });

  it('accepts digits from STT and compares them by value', () => {
    expect(scoreTransmission(drill(['QNH 1013'], true), { transcript: 'qnh 1013' }).score).toBe(
      100,
    );
    expect(scoreTransmission(drill(['FL 065']), { transcript: 'flight level 65' }).score).toBe(100);
  });

  it('fails a QNH with a wrong digit or said as a cardinal', () => {
    for (const transcript of ['qnh one zero one four', 'qnh ten thirteen', 'qnh 1014']) {
      const result = scoreTransmission(drill(['QNH 1013'], true), { transcript });
      expect(result.missedCritical).toEqual(['item']);
      expect(result.success).toBe(false);
    }
  });
});

describe('scoreTransmission: frequencies', () => {
  it('accepts a spoken frequency with ICAO "niner" and dropped trailing zeros', () => {
    const result = scoreTransmission(frequencyDrill, {
      transcript: 'contact ground one two one decimal niner sierra papa tango foxtrot alpha',
    });
    expect(result.score).toBe(100);
    expect(result.elements.find((e) => e.id === 'frequency')?.status).toBe('matched');
  });

  it('accepts all digits of a frequency', () => {
    const result = scoreTransmission(frequencyDrill, {
      transcript:
        'contact ground one two one decimal niner zero zero sierra papa tango foxtrot alpha',
    });
    expect(result.score).toBe(100);
  });

  it('gives "point" partial credit without failing the critical frequency', () => {
    const result = scoreTransmission(frequencyDrill, {
      transcript: 'contact ground one two one point niner sierra papa tango foxtrot alpha',
    });
    expect(result.elements.find((e) => e.id === 'frequency')?.status).toBe('partial');
    expect(result.missedCritical).toEqual([]);
    expect(result.tip).toBe('Say "decimal", not "point": use the ICAO form.');
  });

  it('rejects a wrong frequency', () => {
    const result = scoreTransmission(frequencyDrill, {
      transcript: 'contact ground one two one decimal eight sierra papa tango foxtrot alpha',
    });
    expect(result.missedCritical).toEqual(['frequency']);
    expect(result.success).toBe(false);
  });
});
