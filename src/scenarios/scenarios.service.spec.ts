import { NotFoundException } from '@nestjs/common';
import { MAX_VARIANTS } from './content-loader';
import { ScenariosService } from './scenarios.service';

describe('ScenariosService variants', () => {
  const service = new ScenariosService();
  service.onModuleInit();
  const id = 'ground-ctrl-taxi-clearance';

  it('serves the default variant without a key', () => {
    const scenario = service.getScenario(id);
    expect(scenario.variant).toBe(scenario.variants[0]);
    expect(scenario.variant).toBe('EPPO.to-EPPI.w1.sp-tfa');
  });

  it('serves at most MAX_VARIANTS variants, each rendered for its own key', () => {
    const keys = service.variantKeys(id);
    expect(keys.length).toBeGreaterThan(1);
    expect(keys.length).toBeLessThanOrEqual(MAX_VARIANTS);
    const texts = keys.map((key) => service.getScenario(id, key).steps[1].atcText);
    expect(new Set(texts).size).toBeGreaterThan(1);
  });

  it('scores a step of the variant it was asked for', () => {
    const key = service.variantKeys(id).find((k) => k.endsWith('d-epch')) ?? '';
    const { step } = service.getStep(id, 'taxi-readback', key);
    expect(step.atcText?.startsWith('D-EPCH,')).toBe(true);
  });

  it('rejects an unknown variant', () => {
    expect(() => service.getScenario(id, 'EDDB.w9.x')).toThrow(NotFoundException);
  });

  it('keeps static scenarios with one empty key', () => {
    expect(service.variantKeys('alphabet-registrations')).toEqual(['']);
  });
});
