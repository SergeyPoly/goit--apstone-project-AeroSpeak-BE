import type { Aerodrome } from './variant.schema';
import {
  activeRunway,
  angleBetween,
  spreadSample,
  directionTo,
  atcAudioPath,
  buildVariables,
  correctionText,
  renderAlternatives,
  renderTemplate,
  renderText,
  spellRegistration,
  variantContexts,
  variantKey,
} from './variants';

const aerodrome: Aerodrome = {
  icao: 'EPPO',
  name: 'Poznań-Ławica',
  city: ['Poznań', 'Poznan'],
  controlled: true,
  stations: { tower: { name: ['Poznań Tower', 'Poznan Tower'], frequency: '119.980' } },
  runways: [
    { designator: '10', heading: 100, circuit: 'left' },
    {
      designator: '28',
      heading: 280,
      circuit: 'right',
      taxiRoute: 'Alpha',
      departureTurn: { north: 'right' },
    },
  ],
  vfrPoints: [
    { name: 'Delta', location: 'north-west' },
    { name: 'Victor', location: 'north-west' },
  ],
  position: { lat: 52.4211, lon: 16.8261 },
  chart: { source: 'AIP Polska', section: 'AD 2 EPPO 13-1', url: 'https://ais.pansa.pl/' },
  arrivals: { north: { entry: 'Delta', report: 'Victor', altitude: 1500 } },
  departures: { north: { exit: 'Delta', altitude: 1500 } },
};
const pila: Aerodrome = {
  icao: 'EPPI',
  name: 'Piła',
  city: ['Piła', 'Pila'],
  controlled: false,
  position: { lat: 53.17, lon: 16.702 },
  chart: { source: 'AIP VFR Polska', section: 'AD 4 EPPI 4-1', url: 'https://ais.pansa.pl/' },
  stations: { radio: { name: ['Piła Radio', 'Pila Radio'], frequency: '122.405' } },
  runways: [{ designator: '21', heading: 210, circuit: 'right' }],
  vfrPoints: [{ name: 'Kilo', location: 'south-west' }],
  arrivals: { south: { entry: 'Kilo' } },
  departures: {},
};
const weather = [
  { id: 'w1', wind: { direction: 270, speed: 10 }, qnh: 1013, atis: 'Kilo' },
  { id: 'w2', wind: { direction: 90, speed: 5 }, qnh: 998, atis: 'Lima' },
];
const fleet = [
  { id: 'sp-tfa', registration: 'SP-TFA', type: 'Cessna 172' },
  { id: 'd-epch', registration: 'D-EPCH', type: 'Piper PA-28 Cherokee' },
];
const data = {
  aerodromes: new Map([
    ['EPPO', aerodrome],
    ['EPPI', pila],
  ]),
  aircraft: fleet,
  weather,
};

describe('scenario variants', () => {
  it('measures the angle between two directions', () => {
    expect(angleBetween(350, 10)).toBe(20);
    expect(angleBetween(90, 270)).toBe(180);
  });

  it('picks the runway most into the wind', () => {
    expect(activeRunway(aerodrome, weather[0]).designator).toBe('28');
    expect(activeRunway(aerodrome, weather[1]).designator).toBe('10');
  });

  it('spells a registration with the NATO alphabet', () => {
    expect(spellRegistration('SP-TFA')).toBe('Sierra Papa Tango Foxtrot Alpha');
    expect(spellRegistration('D-EPCH')).toBe('Delta Echo Papa Charlie Hotel');
  });

  it('lists every weather and aircraft combination, the default first', () => {
    const contexts = variantContexts({ aerodromes: ['EPPO'], weather: true, aircraft: true }, data);
    expect(contexts.map(variantKey)).toEqual([
      'EPPO.w1.sp-tfa',
      'EPPO.w1.d-epch',
      'EPPO.w2.sp-tfa',
      'EPPO.w2.d-epch',
    ]);
    expect(variantContexts({ aircraft: true }, data).map(variantKey)).toEqual(['sp-tfa', 'd-epch']);
    expect(variantContexts({ aerodromes: ['EPPO'] }, data).map(variantKey)).toEqual(['EPPO']);
    expect(variantContexts({}, data).map(variantKey)).toEqual(['']);
  });

  it('samples a product so that every value comes up evenly', () => {
    const weathers = ['w1', 'w2', 'w3', 'w4'];
    const planes = ['a', 'b', 'c', 'd'];
    const all = weathers.flatMap((w) => planes.map((p) => `${w}.${p}`));
    const picked = spreadSample(all, [4, 4], 8);
    expect(picked).toHaveLength(8);
    expect(picked[0]).toBe('w1.a');
    expect(new Set(picked).size).toBe(8);
    for (const value of [...weathers, ...planes]) {
      expect(picked.filter((key) => key.split('.').includes(value))).toHaveLength(2);
    }
    expect(spreadSample(all, [4, 4], 20)).toBe(all);
  });

  it('fails on an unknown aerodrome', () => {
    expect(() => variantContexts({ aerodromes: ['EDAH'] }, data)).toThrow('unknown aerodrome');
  });

  const [context] = variantContexts({ aerodromes: ['EPPO'], weather: true, aircraft: true }, data);
  const vars = buildVariables(context);

  it('builds wind, QNH, ATIS, runway and station variables', () => {
    expect(renderText('{{callsign}}, {{tower}}, wind {{wind}}, runway {{runway}}', vars)).toBe(
      'SP-TFA, Poznań Tower, wind 270 degrees 10 knots, runway 28',
    );
    expect(renderText('{{wind.brief}} QNH {{qnh}} information {{atis}}', vars)).toBe(
      '270° 10 kt QNH 1013 information Kilo',
    );
    expect(renderText('{{runway.circuit}} downwind via {{runway.taxiRoute}}', vars)).toBe(
      'right downwind via Alpha',
    );
  });

  it('finds the cardinal direction of another aerodrome', () => {
    expect(directionTo(aerodrome, pila)).toBe('north');
    expect(directionTo(pila, aerodrome)).toBe('south');
  });

  it('takes the arrival route from the direction of the origin', () => {
    const [arrival] = variantContexts(
      { aerodromes: ['EPPO'], from: ['EPPI'], aircraft: true },
      data,
    );
    expect(variantKey(arrival)).toBe('EPPO.from-EPPI.sp-tfa');
    expect(
      renderText(
        'From {{arrival.from}}: approaching {{arrival.entry}}, {{arrival.entry.location}} of the control zone, {{arrival.altitude}} feet, report {{arrival.report}}',
        buildVariables(arrival),
      ),
    ).toBe(
      'From Piła: approaching Delta, north-west of the control zone, 1500 feet, report Victor',
    );
  });

  it('takes the departure route and turn towards the destination', () => {
    const [departure] = variantContexts(
      { aerodromes: ['EPPO'], to: ['EPPI'], weather: true },
      data,
    );
    expect(
      renderText(
        'VFR to {{departure.to}}: after departure turn {{runway.departureTurn}}, leave via {{departure.exit}}',
        buildVariables(departure),
      ),
    ).toBe('VFR to Piła: after departure turn right, leave via Delta');
  });

  it('fails when the aerodrome has no route from that direction', () => {
    const [context] = variantContexts({ aerodromes: ['EPPI'], from: ['EPPO'] }, data);
    expect(buildVariables(context)['arrival.entry']).toBe('Kilo');
    const [noRoute] = variantContexts({ aerodromes: ['EPPI'], to: ['EPPO'] }, data);
    expect(() => buildVariables(noRoute)).toThrow('EPPI has no departure to the south');
  });

  it('turns the runway with the wind', () => {
    const contexts = variantContexts({ aerodromes: ['EPPO'], weather: true, aircraft: true }, data);
    expect(contexts.map((c) => c.runway?.designator)).toEqual(['28', '28', '10', '10']);
  });

  it('pads the wind direction to three digits', () => {
    const [, , easterly] = variantContexts(
      { aerodromes: ['EPPO'], weather: true, aircraft: true },
      data,
    );
    expect(renderText('{{wind}}', buildVariables(easterly))).toBe('090 degrees 5 knots');
  });

  it('expands accepted variants into every spelling', () => {
    expect(renderAlternatives('contact {{tower}}', vars)).toEqual([
      'contact Poznań Tower',
      'contact Poznan Tower',
    ]);
    const rendered = renderTemplate(
      {
        label: '{{tower}}',
        acceptedVariants: ['{{tower}}', '{{callsign}}'],
        overview: ['{{tower}}'],
      },
      vars,
    );
    expect(rendered).toEqual({
      label: 'Poznań Tower',
      acceptedVariants: [
        'Poznań Tower',
        'Poznan Tower',
        'SP-TFA',
        'Sierra Papa Tango Foxtrot Alpha',
      ],
      overview: ['Poznań Tower'],
    });
  });

  it('fails on an unknown placeholder', () => {
    expect(() => renderText('{{runway.vacateVia}}', vars)).toThrow('{{runway.vacateVia}}');
  });

  it('turns a clearance into a correction without the station name', () => {
    const stations = ['Poznań Ground', 'Poznan Ground'];
    expect(
      correctionText(
        'SP-TFA, Poznań Ground, taxi to holding point runway 28 via Alpha.',
        'SP-TFA',
        stations,
      ),
    ).toBe('SP-TFA, negative, I say again, taxi to holding point runway 28 via Alpha.');
    expect(correctionText('SP-TFA, hold position.', 'SP-TFA', stations)).toBe(
      'SP-TFA, negative, I say again, hold position.',
    );
    expect(correctionText('Poznań Ground, SP-TFA, hold.', 'SP-TFA', stations)).toBeUndefined();
  });

  it('derives the ATC audio path from the text', () => {
    expect(atcAudioPath('SP-TFA, hold position.')).toMatch(/^\/audio\/atc\/[0-9a-f]{16}\.mp3$/);
    expect(atcAudioPath('a')).not.toBe(atcAudioPath('b'));
  });
});
