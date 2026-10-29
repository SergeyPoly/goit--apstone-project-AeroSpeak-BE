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

  it.each([
    'taxi to holding point runway two one via alpha bravo hold short runway two one sierra papa tango foxtrot alpha',
    'sierra papa tango foxtrot alpha taxi to holding point runway two one via alpha bravo hold short runway two one',
  ])('accepts the callsign at the start or at the end of a readback: %s', (transcript) => {
    const result = scoreTransmission(taxiReadback, { transcript });
    expect(result.score).toBe(100);
    expect(result.order).toEqual({
      rule: 'readback',
      correct: true,
      outOfOrder: [],
      lostPoints: 0,
    });
  });

  it('does not grade the order of the read-back items', () => {
    const result = scoreTransmission(taxiReadback, {
      transcript:
        'hold short runway two one taxi to holding point runway two one via alpha bravo sierra papa tango foxtrot alpha',
    });
    expect(result.order?.correct).toBe(true);
    expect(result.score).toBe(100);
  });

  it('marks a callsign in the middle of a readback and says how much it cost', () => {
    const result = scoreTransmission(taxiReadback, {
      transcript:
        'taxi to holding point runway two one via alpha bravo sierra papa tango foxtrot alpha hold short runway two one',
    });
    expect(result.order).toEqual({
      rule: 'readback',
      correct: false,
      outOfOrder: ['callsign'],
      message: 'In a readback, say the callsign at the start or at the end, not in the middle.',
      lostPoints: 10,
    });
    expect(result.score).toBe(90);
    expect(result.tip).toBe(result.order?.message);
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

/** Start-up request: several elements next to each other (ground-ctrl-start-up). */
const startUpRequest: ScoringStep = {
  type: 'pilot_request',
  expectedPilotResponse:
    'Poznań Ground, SP-TFA, Cessna 172 at the general aviation apron, information Kilo, request start-up.',
  requiredElements: [
    { id: 'station', label: 'Poznań Ground', acceptedVariants: ['Poznań Ground'], weight: 10 },
    { id: 'callsign', label: 'SP-TFA', acceptedVariants: ['SP-TFA'], weight: 20, critical: true },
    { id: 'type', label: 'Cessna 172', acceptedVariants: ['Cessna 172'], weight: 15 },
    {
      id: 'position',
      label: 'General aviation apron',
      acceptedVariants: ['general aviation apron', 'GA apron'],
      weight: 15,
    },
    { id: 'atis', label: 'Information Kilo', acceptedVariants: ['information Kilo'], weight: 20 },
    {
      id: 'request',
      label: 'Request start-up',
      acceptedVariants: ['request start-up'],
      weight: 20,
    },
  ],
};

describe('scoreTransmission: order of a call', () => {
  it('accepts the standard order: station, callsign, position, request', () => {
    const result = scoreTransmission(startUpRequest, {
      transcript:
        'poznan ground sierra papa tango foxtrot alpha cessna one seven two at general aviation apron information kilo request startup',
    });
    expect(result.order).toEqual({ rule: 'call', correct: true, outOfOrder: [], lostPoints: 0 });
  });

  it('marks the element said in the wrong place and shows the standard order', () => {
    const result = scoreTransmission(startUpRequest, {
      transcript:
        'sierra papa tango foxtrot alpha poznan ground cessna one seven two at general aviation apron information kilo request startup',
    });
    expect(result.order?.rule).toBe('call');
    expect(result.order?.correct).toBe(false);
    expect(result.order?.outOfOrder).toHaveLength(1);
    expect(result.order?.lostPoints).toBe(2);
    expect(result.order?.message).toContain(
      'Standard order: Poznań Ground → SP-TFA → Cessna 172 → General aviation apron → Information Kilo → Request start-up.',
    );
  });
});

describe('scoreTransmission: words of other elements', () => {
  const result = scoreTransmission(startUpRequest, {
    transcript:
      'poznan ground sierra papa tango foxtrot alpha at general aviation information kilo request startup',
  });
  const element = (id: string) => result.elements.find((e) => e.id === id);

  it('does not show a word of the next element as heard instead of a skipped word', () => {
    expect(element('position')?.words).toEqual([
      { expected: 'general', heard: 'general', status: 'correct' },
      { expected: 'aviation', heard: 'aviation', status: 'correct' },
      { expected: 'apron', status: 'missing' },
    ]);
    expect(element('atis')?.status).toBe('matched');
  });

  it('shows a left-out element as missing words, without random heard words', () => {
    expect(element('type')?.status).toBe('missed');
    expect(element('type')?.words.every((w) => w.status === 'missing' && !w.heard)).toBe(true);
  });

  it("does not give unclear credit to another element's word", () => {
    const unsure = scoreTransmission(startUpRequest, {
      transcript: '',
      words: [
        ...'poznan ground sierra papa tango foxtrot alpha at general aviation'
          .split(' ')
          .map((word) => ({ word, confidence: 0.9 })),
        { word: 'information', confidence: 0.3 },
        { word: 'kilo', confidence: 0.9 },
        { word: 'request', confidence: 0.9 },
        { word: 'startup', confidence: 0.9 },
      ],
    });
    const apron = unsure.elements.find((e) => e.id === 'position')?.words[2];
    expect(apron).toEqual({ expected: 'apron', status: 'missing' });
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

  it('wants a flight level digit by digit, without a leading zero (Doc 9432 2.4.2)', () => {
    expect(scoreTransmission(drill(['FL 65']), { transcript: 'flight level six five' }).score).toBe(
      100,
    );
  });

  it('marks a non-standard number form as almost and names the standard one', () => {
    const result = scoreTransmission(drill(['squawk 7000']), {
      transcript: 'squawk seven zero zero zero',
    });
    expect(result.elements[0].status).toBe('partial');
    expect(result.elements[0].hint).toBe('Say "seven thousand": that is the standard form.');
    expect(result.score).toBe(76);
    expect(
      scoreTransmission(drill(['squawk 7000']), { transcript: 'squawk seven thousand' }).score,
    ).toBe(100);
  });

  it('wants a heading digit by digit (CAP 413 2.13.1)', () => {
    const heading = drill(['heading 300']);
    expect(scoreTransmission(heading, { transcript: 'heading three zero zero' }).score).toBe(100);
    expect(scoreTransmission(heading, { transcript: 'heading three hundred' }).score).toBeLessThan(
      100,
    );
  });

  it('wants all six figures of a frequency unless the last two are zeros (CAP 413 2.15)', () => {
    const short = { transcript: 'one two four decimal one four' };
    expect(scoreTransmission(drill(['124.140']), short).score).toBeLessThan(100);
    expect(
      scoreTransmission(drill(['122.500']), { transcript: 'one two two decimal five' }).score,
    ).toBe(100);
  });

  it('wants distances digit by digit: "one zero miles", not "ten miles"', () => {
    expect(scoreTransmission(drill(['10 miles']), { transcript: 'one zero miles' }).score).toBe(
      100,
    );
    expect(scoreTransmission(drill(['10 miles']), { transcript: 'ten miles' }).score).toBeLessThan(
      100,
    );
  });

  it('accepts QNH 1000 as "one thousand"; digit by digit is almost (Doc 9432 2.4.3)', () => {
    expect(
      scoreTransmission(drill(['QNH 1000'], true), { transcript: 'qnh one thousand' }).score,
    ).toBe(100);
    const digits = scoreTransmission(drill(['QNH 1000'], true), {
      transcript: 'qnh one zero zero zero',
    });
    expect(digits.missedCritical).toEqual([]);
    expect(digits.elements[0].status).toBe('partial');
  });

  it('marks a left-out optional word as almost, not missing', () => {
    const result = scoreTransmission(drill(['not above [altitude] 1500 feet'], true), {
      transcript: 'not above one thousand five hundred feet',
    });
    expect(result.missedCritical).toEqual([]);
    expect(result.elements[0].words.find((w) => w.expected === 'altitude')).toEqual({
      expected: 'altitude',
      status: 'almost',
    });
    expect(result.elements[0].hint).toBe('Say "altitude" too.');
    expect(result.tip).toBe('not above [altitude] 1500 feet: Say "altitude" too.');
  });

  it('treats "to" before a number or "altitude" as an error (AIP Polska GEN 1.7)', () => {
    const climbing = drill(['climbing [altitude] 2000 feet'], true);
    const error =
      '"to" before a number or "altitude" is an error (AIP Polska GEN 1.7): leave it out.';
    for (const transcript of [
      'climbing to altitude two thousand feet',
      'climbing to two thousand feet',
    ]) {
      const result = scoreTransmission(climbing, { transcript });
      expect(result.elements[0].status).toBe('missed');
      expect(result.elements[0].hint?.startsWith(error)).toBe(true);
      expect(result.missedCritical).toEqual(['item']);
      expect(result.score).toBeLessThanOrEqual(CRITICAL_MISS_CAP);
      expect(result.tip.startsWith('climbing [altitude] 2000 feet: "to"')).toBe(true);
    }
    expect(
      scoreTransmission(climbing, { transcript: 'climbing altitude two thousand feet' }).score,
    ).toBe(100);
  });

  it('takes at least 5 points for each non-standard item, even in a long call', () => {
    const call: ScoringStep = {
      type: 'pilot_request',
      expectedPilotResponse:
        'Poznań Tower, SP-TFA, approaching Delta, altitude 2000 feet, inbound for landing.',
      requiredElements: [
        { id: 'station', label: 'Poznań Tower', acceptedVariants: ['Poznań Tower'], weight: 20 },
        { id: 'callsign', label: 'SP-TFA', acceptedVariants: ['SP-TFA'], weight: 25 },
        {
          id: 'position',
          label: 'Approaching Delta',
          acceptedVariants: ['approaching Delta'],
          weight: 20,
        },
        {
          id: 'altitude',
          label: 'Altitude 2000 feet',
          acceptedVariants: ['[altitude] 2000 feet'],
          weight: 15,
        },
        {
          id: 'inbound',
          label: 'Inbound for landing',
          acceptedVariants: ['inbound for landing'],
          weight: 20,
        },
      ],
    };
    const words = 'poznan tower sierra papa tango foxtrot alpha approaching delta';
    expect(
      scoreTransmission(call, {
        transcript: `${words} altitude two thousand feet inbound for landing`,
      }).score,
    ).toBe(100);
    expect(
      scoreTransmission(call, { transcript: `${words} two thousand feet inbound for landing` })
        .score,
    ).toBe(95);
  });

  it('does not take "to" for "two" inside a number', () => {
    const result = scoreTransmission(drill(['runway 21']), { transcript: 'runway to one' });
    expect(result.score).toBe(100);
  });

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
    expect(scoreTransmission(drill(['FL 65']), { transcript: 'flight level 65' }).score).toBe(100);
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

  it('marks six digits as almost when the last two are zeros (Doc 9432 2.4.4)', () => {
    const result = scoreTransmission(frequencyDrill, {
      transcript:
        'contact ground one two one decimal niner zero zero sierra papa tango foxtrot alpha',
    });
    const frequency = result.elements.find((e) => e.id === 'frequency');
    expect(frequency?.status).toBe('partial');
    expect(frequency?.hint).toBe('Say "one two one decimal niner": that is the standard form.');
    expect(result.missedCritical).toEqual([]);
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
