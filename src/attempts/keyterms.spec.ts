import { keytermsForStep } from './keyterms';

describe('keytermsForStep', () => {
  it('keeps names and spoken words, never digits or written codes', () => {
    const terms = keytermsForStep({
      type: 'pilot_readback',
      expectedPilotResponse: '',
      requiredElements: [
        {
          id: 'a',
          label: 'a',
          acceptedVariants: ['SP-TFA', 'Sierra Papa Tango Foxtrot Alpha'],
          weight: 1,
        },
        { id: 'b', label: 'b', acceptedVariants: ['hold short runway 29', 'SP-TFA'], weight: 1 },
        { id: 'c', label: 'c', acceptedVariants: ['QNH 1013', 'Piła Radio'], weight: 1 },
        { id: 'd', label: 'd', acceptedVariants: ['wilco'], weight: 1 },
      ],
    });
    expect(terms).toEqual([
      'Sierra Papa Tango Foxtrot Alpha',
      'Piła Radio',
      'QNH',
      'sierra',
      'papa',
      'tango',
      'foxtrot',
      'alpha',
      'niner',
      'tree',
    ]);
  });

  it('adds "decimal" and ICAO digits for a frequency', () => {
    const terms = keytermsForStep({
      type: 'basic_drill',
      expectedPilotResponse: '',
      requiredElements: [{ id: 'f', label: 'f', acceptedVariants: ['118.505'], weight: 1 }],
    });
    expect(terms).toEqual(['decimal', 'fife']);
  });
});
