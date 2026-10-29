import type { ElementResult, OrderRule, ScoringStep } from './types';

/** Content convention: the aircraft callsign element has this id. */
export const CALLSIGN_ID = 'callsign';

/**
 * Which order rule a step follows:
 *
 *   readback  a readback or an acknowledgement ("Wilco, SP-TFA"): the callsign goes
 *             at the start or at the end, never in the middle; the read-back items
 *             themselves may come in any order.
 *   call      a call the pilot starts (request, self-announce, position report):
 *             the standard structure in the order of the content elements:
 *             who you are calling, who you are, position, request, information.
 */
export function orderRuleFor(step: ScoringStep): OrderRule {
  const hasCallsign = step.requiredElements.some((e) => e.id === CALLSIGN_ID);
  if (step.type === 'pilot_readback') return 'readback';
  if (step.type === 'basic_drill' && hasCallsign) return 'readback';
  return 'call';
}

export interface OrderCheck {
  rule: OrderRule;
  /** 0..1 share of the order kept. */
  value: number;
  /** Ids of elements said in the wrong place. */
  outOfOrder: string[];
  /** What to fix, when the order is wrong. */
  message?: string;
}

/** Indices (into `values`) of one longest increasing subsequence. */
function longestIncreasingRun(values: number[]): Set<number> {
  const lengths = values.map(() => 1);
  const prev = values.map(() => -1);
  for (let i = 1; i < values.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (values[j] < values[i] && lengths[j] + 1 > lengths[i]) {
        lengths[i] = lengths[j] + 1;
        prev[i] = j;
      }
    }
  }
  const run = new Set<number>();
  let k = lengths.indexOf(Math.max(...lengths));
  while (k !== -1) {
    run.add(k);
    k = prev[k];
  }
  return run;
}

/**
 * Checks the order of the elements the pilot said. Returns null when there is
 * nothing to compare (fewer than two elements found, or no callsign in a readback).
 */
export function checkOrder(step: ScoringStep, elements: ElementResult[]): OrderCheck | null {
  const rule = orderRuleFor(step);
  const found = elements.filter((e) => e.position !== undefined);

  if (rule === 'readback') {
    const callsign = found.find((e) => e.id === CALLSIGN_ID);
    const others = found.filter((e) => e.id !== CALLSIGN_ID).map((e) => e.position as number);
    if (!callsign || others.length === 0) return null;
    const at = callsign.position as number;
    if (at < Math.min(...others) || at > Math.max(...others)) {
      return { rule, value: 1, outOfOrder: [] };
    }
    return {
      rule,
      value: 0,
      outOfOrder: [CALLSIGN_ID],
      message: 'In a readback, say the callsign at the start or at the end, not in the middle.',
    };
  }

  if (found.length < 2) return null;
  const run = longestIncreasingRun(found.map((e) => e.position as number));
  const outOfOrder = found.filter((_, i) => !run.has(i));
  if (outOfOrder.length === 0) return { rule, value: 1, outOfOrder: [] };

  const standard = step.requiredElements.map((e) => e.label).join(' → ');
  return {
    rule,
    value: run.size / found.length,
    outOfOrder: outOfOrder.map((e) => e.id),
    message: `"${outOfOrder[0].label}" is out of place. Standard order: ${standard}.`,
  };
}
