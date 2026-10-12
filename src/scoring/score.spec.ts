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
      acceptedVariants: ['hold short runway 21', 'hold short of runway 21', 'holding short runway 21'],
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
    { id: 'frequency', label: '121.900', acceptedVariants: ['121.900'], weight: 50, critical: true },
    { id: 'callsign', label: 'SP-TFA', acceptedVariants: ['SP-TFA'], weight: 20 },
  ],
};

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
  it('gives a top score to a perfect spelled-out readback', () => {
    const result = scoreTransmission(taxiReadback, {
      transcript:
        'Taxi to holding point runway two one via Alpha, Bravo, hold short runway two one, Sierra Papa Tango Foxtrot Alpha',
      confidence: 0.95,
    });

    expect(result.elements.every((e) => e.status === 'matched')).toBe(true);
    expect(result.displayScore).toBe(6);
    expect(result.success).toBe(true);
    expect(result.missedCritical).toEqual([]);
    expect(result.orderCorrect).toBe(true);
  });

  it('accepts digits and a written callsign from STT', () => {
    const result = scoreTransmission(taxiReadback, {
      transcript: 'Taxi to holding point runway 21 via Alpha Bravo, hold short of runway 21, SP-TFA.',
    });
    expect(result.success).toBe(true);
    expect(result.score).toBe(100);
  });

  it('fails a readback without "hold short" and explains why', () => {
    const result = scoreTransmission(taxiReadback, {
      transcript: 'Taxi to holding point runway 21 via Alpha Bravo, SP-TFA',
      confidence: 0.95,
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
        'Taxi to holding point runway 12 via Alpha Bravo, hold short runway 12, SP-TFA',
      confidence: 0.95,
    });

    const holdShort = result.elements.find((e) => e.id === 'hold_short');
    expect(holdShort?.status).toBe('missed');
    expect(result.success).toBe(false);
  });

  it('fails a readback without the callsign', () => {
    const result = scoreTransmission(taxiReadback, {
      transcript: 'Taxi to holding point runway 21 via Alpha Bravo, hold short runway 21',
    });
    expect(result.missedCritical).toEqual(['callsign']);
    expect(result.success).toBe(false);
  });

  it('gives partial credit for a small STT error in the callsign', () => {
    const result = scoreTransmission(taxiReadback, {
      transcript: 'Taxi to holding point runway 21 via Alpha Bravo, hold short runway 21, SP-TFE',
    });
    const callsign = result.elements.find((e) => e.id === 'callsign');
    expect(callsign?.status).toBe('partial');
    expect(result.missedCritical).toEqual([]);
  });

  it('lowers the score when elements are out of order but still passes', () => {
    const inOrder = scoreTransmission(taxiReadback, {
      transcript: 'Taxi to holding point runway 21 via Alpha Bravo, hold short runway 21, SP-TFA',
    });
    const outOfOrder = scoreTransmission(taxiReadback, {
      transcript: 'SP-TFA, hold short runway 21, taxi to holding point runway 21 via Alpha Bravo',
    });

    expect(outOfOrder.orderCorrect).toBe(false);
    expect(outOfOrder.score).toBeLessThan(inOrder.score);
    expect(outOfOrder.success).toBe(true);
  });

  it('gives zero for an unrelated transmission', () => {
    const result = scoreTransmission(taxiReadback, {
      transcript: 'Request startup',
      confidence: 0.99,
    });
    expect(result.score).toBe(0);
    expect(result.displayScore).toBe(1);
  });

  it('gives zero for an empty transcript', () => {
    const result = scoreTransmission(taxiReadback, { transcript: '' });
    expect(result.score).toBe(0);
    expect(result.success).toBe(false);
  });
});

describe('scoreTransmission: basic drill', () => {
  it('accepts a spoken frequency with ICAO "niner"', () => {
    const result = scoreTransmission(frequencyDrill, {
      transcript: 'Contact Ground on one two one decimal niner, Sierra Papa Tango Foxtrot Alpha',
    });
    expect(result.success).toBe(true);
    expect(result.elements.find((e) => e.id === 'frequency')?.status).toBe('matched');
  });

  it('rejects a wrong frequency', () => {
    const result = scoreTransmission(frequencyDrill, {
      transcript: 'Contact Ground on one two one decimal eight, SP-TFA',
    });
    expect(result.missedCritical).toEqual(['frequency']);
    expect(result.success).toBe(false);
  });
});
