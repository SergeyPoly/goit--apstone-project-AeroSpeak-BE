import { ScenariosService } from '../scenarios/scenarios.service';
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
      'hold short runway two niner',
      'two niner',
      'qnh one zero one tree',
      'one zero one tree',
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

  it('adds a frequency in spoken words and in chunks split at "decimal"', () => {
    const terms = keytermsForStep({
      type: 'pilot_readback',
      expectedPilotResponse: '',
      requiredElements: [
        { id: 'f', label: 'f', acceptedVariants: ['contact Ground 124.140'], weight: 1 },
      ],
    });
    expect(terms).toEqual([
      'contact ground one two four decimal one four zero',
      'one two four',
      'one four zero',
      'decimal',
    ]);
  });

  it('uses the standard spoken form of a number', () => {
    const terms = keytermsForStep({
      type: 'pilot_readback',
      expectedPilotResponse: '',
      requiredElements: [{ id: 's', label: 's', acceptedVariants: ['squawk 7000'], weight: 1 }],
    });
    expect(terms.slice(0, 2)).toEqual(['squawk seven thousand', 'seven thousand']);
  });

  it('keeps every step of every scenario variant within the keyterm limit', () => {
    const scenarios = new ScenariosService();
    scenarios.onModuleInit();
    const counts = scenarios
      .listPacks()
      .flatMap((pack) => pack.scenarios)
      .flatMap(({ id }) =>
        scenarios
          .getScenario(id)
          .variants.flatMap((variant) =>
            scenarios
              .getScenario(id, variant)
              .steps.map((step) => keytermsForStep(step, 1000).length),
          ),
      );
    expect(Math.max(...counts)).toBeLessThanOrEqual(50);
  });
});
