import { z } from 'zod';

/**
 * Data that scenario templates are rendered with: the aircraft fleet
 * (content/aircraft.json) and one file per aerodrome (content/aerodromes/<ICAO>.json).
 * See content/aerodromes.md for where the values come from.
 */

/** A name with its accepted spellings, the first one is shown: ["Poznań Tower", "Poznan Tower"]. */
const spellings = z.array(z.string().min(1)).min(1);
const frequency = z.string().regex(/^1\d\d\.\d{3}$/, 'six digits, e.g. "119.980"');

export const aircraftSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  registration: z.string().regex(/^[A-Z0-9]{1,2}-[A-Z]{3,4}$/, 'e.g. "SP-TFA" or "D-EPCH"'),
  /** As said on the radio: "Cessna 172", "Piper PA-28 Cherokee". */
  type: z.string().min(1),
});

/** The four cardinal directions a VFR route leaves or joins an aerodrome by. */
export const DIRECTIONS = ['north', 'east', 'south', 'west'] as const;
export const directionSchema = z.enum(DIRECTIONS);

export const runwaySchema = z.object({
  designator: z.string().regex(/^(0[1-9]|[1-2]\d|3[0-6])[LRC]?$/),
  /** Magnetic heading in degrees, used to pick the runway most into the wind. */
  heading: z.number().int().min(1).max(360),
  circuit: z.enum(['left', 'right']),
  /** Taxi route from the apron to the holding point, e.g. "Alpha". */
  taxiRoute: z.string().min(1).optional(),
  vacateSide: z.enum(['left', 'right']).optional(),
  vacateVia: z.string().min(1).optional(),
  /** Taxi route from the runway exit to the apron. */
  taxiInRoute: z.string().min(1).optional(),
  /** Turn after take-off towards the exit point of each departure direction. */
  departureTurn: z.record(directionSchema, z.enum(['left', 'right'])).optional(),
});

/** A weather preset of content/weather.json, the same at every aerodrome. */
export const weatherSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+$/),
  wind: z.object({
    direction: z.number().int().min(10).max(360).multipleOf(10),
    speed: z.number().int().min(1).max(30),
  }),
  qnh: z.number().int().min(950).max(1050),
  /** ATIS letter as a NATO word, used at aerodromes with ATIS. */
  atis: z.string().min(1),
});

/** VFR reporting point as in the AIP, with where it is from the aerodrome ("north-west"). */
const vfrPointSchema = z.object({ name: z.string().min(1), location: z.string().min(1) });

/** VFR arrival route from one direction; points are VFR points of the aerodrome. */
const arrivalSchema = z.object({
  /** Where the aircraft enters the CTR or calls the aerodrome. */
  entry: z.string().min(1),
  /** Point to report after the entry (controlled aerodromes). */
  report: z.string().min(1).optional(),
  /** Maximum altitude in feet given with the CTR entry. */
  altitude: z.number().int().positive().optional(),
  /** Town or landmark on the way in that FIS asks to report, e.g. "Oborniki". */
  waypoint: z.string().min(1).optional(),
});
/** VFR departure route towards one direction. */
const departureSchema = z.object({
  exit: z.string().min(1),
  altitude: z.number().int().positive().optional(),
});

export const aerodromeSchema = z
  .object({
    icao: z.string().regex(/^[A-Z]{4}$/),
    name: z.string().min(1),
    /** Town as said on the radio, e.g. ["Piła", "Pila"]. */
    city: spellings,
    controlled: z.boolean(),
    /** Aerodrome reference point in decimal degrees: gives the direction to another aerodrome. */
    position: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }),
    /** The aerodrome's VFR chart, cited in phraseology notes as `{{chart.source}}`, `{{chart.section}}`. */
    chart: z.object({
      source: z.string().min(1),
      section: z.string().min(1),
      url: z.string().url(),
    }),
    /** Keyed by role: ground, tower, approach, radio, information... Templates use `{{tower}}`, `{{tower.freq}}`. */
    stations: z.record(z.string().regex(/^[a-z]+$/), z.object({ name: spellings, frequency })),
    runways: z.array(runwaySchema).min(1),
    vfrPoints: z.array(vfrPointSchema).min(1),
    /** Keyed by the direction the aircraft comes from: a flight from the north uses `arrivals.north`. */
    arrivals: z.record(directionSchema, arrivalSchema).default({}),
    /** Keyed by the direction the aircraft goes to. */
    departures: z.record(directionSchema, departureSchema).default({}),
  })
  .superRefine((aerodrome, ctx) => {
    const points = new Set(aerodrome.vfrPoints.map((p) => p.name));
    const used: Array<[string, string, string | undefined]> = [
      ...Object.entries(aerodrome.arrivals).flatMap(([dir, route]) => [
        [`arrivals.${dir}`, 'entry', route.entry] as [string, string, string],
        [`arrivals.${dir}`, 'report', route.report] as [string, string, string | undefined],
      ]),
      ...Object.entries(aerodrome.departures).map(
        ([dir, route]) => [`departures.${dir}`, 'exit', route.exit] as [string, string, string],
      ),
    ];
    for (const [route, field, point] of used) {
      if (point && !points.has(point)) {
        ctx.addIssue({
          code: 'custom',
          path: [...route.split('.'), field],
          message: `"${point}" is not a VFR point of the aerodrome`,
        });
      }
    }
  });

export const weatherFileSchema = z
  .array(weatherSchema)
  .min(1)
  .superRefine((presets, ctx) => {
    const ids = presets.map((w) => w.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', message: 'duplicate weather ids' });
    }
  });

/** Which data a scenario template is rendered with. Without it the scenario is static. */
export const scenarioVariantsSchema = z.object({
  /** Aerodromes where the scenario takes place, each one becomes a variant. */
  aerodromes: z
    .array(z.string().regex(/^[A-Z]{4}$/))
    .min(1)
    .optional(),
  /** Arrival scenarios: aerodromes the flight comes from. The arrival route is the one from their direction. */
  from: z
    .array(z.string().regex(/^[A-Z]{4}$/))
    .min(1)
    .optional(),
  /** Departure scenarios: aerodromes the flight goes to. The departure route is the one towards them. */
  to: z
    .array(z.string().regex(/^[A-Z]{4}$/))
    .min(1)
    .optional(),
  /** Render once per weather preset (wind, QNH, ATIS); the runway in use follows the wind. */
  weather: z.boolean().optional(),
  /** Render once per aircraft of the fleet. */
  aircraft: z.boolean().optional(),
});

export type Aircraft = z.infer<typeof aircraftSchema>;
export type Runway = z.infer<typeof runwaySchema>;
export type Weather = z.infer<typeof weatherSchema>;
export type Aerodrome = z.infer<typeof aerodromeSchema>;
export type ScenarioVariants = z.infer<typeof scenarioVariantsSchema>;
export type Direction = z.infer<typeof directionSchema>;
