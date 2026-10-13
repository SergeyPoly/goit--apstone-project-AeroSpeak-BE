import { keytermsForStep } from './keyterms';

describe('keytermsForStep', () => {
  it('keeps short distinctive variants and removes duplicates', () => {
    const terms = keytermsForStep({
      type: 'pilot_readback',
      expectedPilotResponse: '',
      requiredElements: [
        { id: 'a', label: 'a', acceptedVariants: ['SP-TFA', 'Sierra Papa Tango Foxtrot Alpha'], weight: 1 },
        { id: 'b', label: 'b', acceptedVariants: ['hold short runway 21', 'SP-TFA'], weight: 1 },
        { id: 'c', label: 'c', acceptedVariants: ['wilco'], weight: 1 },
      ],
    });
    expect(terms).toEqual(['SP-TFA', 'Sierra Papa Tango Foxtrot Alpha', 'hold short runway 21']);
  });
});
