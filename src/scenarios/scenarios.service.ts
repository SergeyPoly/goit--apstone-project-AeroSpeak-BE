import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { resolve } from 'node:path';
import { loadContent, type ScenarioVariantSet } from './content-loader';
import type { PracticePack, Scenario, ScenarioStep } from './scenario.schema';

export const CONTENT_DIR = resolve(process.cwd(), 'content');

/** A scenario rendered for one variant, with the keys of all its variants. */
export type RenderedScenario = Scenario & { variant: string; variants: string[] };

@Injectable()
export class ScenariosService implements OnModuleInit {
  private readonly logger = new Logger(ScenariosService.name);
  private packs: PracticePack[] = [];
  private scenarios = new Map<string, Scenario>();
  private variants = new Map<string, ScenarioVariantSet>();

  onModuleInit() {
    const content = loadContent(CONTENT_DIR);
    this.packs = content.packs;
    this.scenarios = new Map(content.scenarios.map((s) => [s.id, s]));
    this.variants = content.variants;
    const variantCount = [...this.variants.values()].reduce((n, set) => n + set.keys.length, 0);
    this.logger.log(
      `Loaded ${this.packs.length} packs and ${this.scenarios.size} scenarios (${variantCount} variants)`,
    );
  }

  listPacks(): Array<PracticePack & { scenarios: Scenario[] }> {
    const all = [...this.scenarios.values()];
    return this.packs.map((pack) => ({
      ...pack,
      scenarios: all.filter((s) => s.packId === pack.id),
    }));
  }

  /** All scenarios in content order, each in its default variant. */
  listScenarios(): Scenario[] {
    return [...this.scenarios.values()];
  }

  /** Variant keys of a scenario; the first one is the default. */
  variantKeys(id: string): string[] {
    return this.variantSet(id).keys;
  }

  /**
   * A scenario rendered for a variant. Without a variant: the default one, so a client that
   * does not know about variants gets the same text for the scenario and its attempts.
   */
  getScenario(id: string, variant?: string): RenderedScenario {
    const set = this.variantSet(id);
    const key = variant ?? set.keys[0];
    const scenario = set.byKey.get(key);
    if (!scenario) throw new NotFoundException(`Variant "${key}" not found in "${id}"`);
    return { ...scenario, variant: key, variants: set.keys };
  }

  getStep(
    scenarioId: string,
    stepId: string,
    variant?: string,
  ): { scenario: Scenario; step: ScenarioStep } {
    const scenario = this.getScenario(scenarioId, variant);
    const step = scenario.steps.find((s) => s.id === stepId);
    if (!step) throw new NotFoundException(`Step "${stepId}" not found in "${scenarioId}"`);
    return { scenario, step };
  }

  private variantSet(id: string): ScenarioVariantSet {
    const set = this.variants.get(id);
    if (!set) throw new NotFoundException(`Scenario "${id}" not found`);
    return set;
  }
}
