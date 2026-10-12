import { z } from 'zod';

/**
 * Scenario content schemas (spec, section 13).
 * Content files in /content are validated against these at startup, so a
 * broken scenario stops the deploy instead of failing for a user.
 */

const id = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, 'use lowercase kebab-case or snake_case ids');

export const requiredElementSchema = z.object({
  id,
  label: z.string().min(1),
  acceptedVariants: z.array(z.string().min(1)).min(1),
  weight: z.number().positive(),
  critical: z.boolean().optional(),
});

export const scenarioStepSchema = z
  .object({
    id,
    type: z.enum(['basic_drill', 'pilot_request', 'atc_instruction', 'pilot_readback', 'self_announce']),
    speaker: z.enum(['pilot', 'atc']),
    prompt: z.string().min(1),
    atcText: z.string().min(1).optional(),
    /** Path of the pre-generated ATC audio in the frontend `public/` folder. */
    atcAudio: z.string().min(1).optional(),
    expectedPilotResponse: z.string().min(1),
    requiredElements: z.array(requiredElementSchema).min(1),
    criticalElements: z.array(id).optional(),
    phraseologyReferenceId: z.string().optional(),
  })
  .superRefine((step, ctx) => {
    const elementIds = new Set(step.requiredElements.map((e) => e.id));
    if (elementIds.size !== step.requiredElements.length) {
      ctx.addIssue({ code: 'custom', message: 'duplicate requiredElements ids' });
    }
    for (const criticalId of step.criticalElements ?? []) {
      if (!elementIds.has(criticalId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['criticalElements'],
          message: `unknown element id "${criticalId}"`,
        });
      }
    }
    if (step.type === 'pilot_readback' && !step.atcText) {
      ctx.addIssue({ code: 'custom', path: ['atcText'], message: 'readback steps need atcText' });
    }
  });

export const phraseologyNoteSchema = z.object({
  id,
  title: z.string().min(1),
  shortExplanation: z.string().min(1),
  example: z.string().min(1),
  whyItMatters: z.string().optional(),
});

export const scenarioSchema = z
  .object({
    id,
    title: z.string().min(1),
    packId: id,
    difficulty: z.enum(['easy', 'medium', 'hard']),
    estimatedDurationSec: z.number().int().positive(),
    objective: z.string().min(1),
    briefing: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })).optional(),
    phraseologyNote: phraseologyNoteSchema.optional(),
    steps: z.array(scenarioStepSchema).min(1),
  })
  .superRefine((scenario, ctx) => {
    const stepIds = new Set(scenario.steps.map((s) => s.id));
    if (stepIds.size !== scenario.steps.length) {
      ctx.addIssue({ code: 'custom', path: ['steps'], message: 'duplicate step ids' });
    }
  });

export const practicePackSchema = z.object({
  id,
  title: z.string().min(1),
  description: z.string().min(1),
  order: z.number().int(),
  recommendedForBeginners: z.boolean().optional(),
});

export const packsFileSchema = z.array(practicePackSchema).min(1);

export type RequiredElement = z.infer<typeof requiredElementSchema>;
export type ScenarioStep = z.infer<typeof scenarioStepSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type PracticePack = z.infer<typeof practicePackSchema>;
