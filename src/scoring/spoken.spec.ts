import { expandToSpoken } from './spoken';

const forms = (variant: string) =>
  expandToSpoken(variant).map((form) => form.map((w) => w.word).join(' '));

describe('expandToSpoken', () => {
  it.each([
    // Digits in ICAO pronunciation
    ['QNH 998', 'qnh niner niner eight'],
    ['QNH 1013', 'qnh one zero one tree'],
    ['runway 03', 'runway zero tree'],
    ['squawk 4721', 'squawk four seven two one'],
    ['1435', 'one four tree fife'],
    ['number 2', 'number two'],
    // Altitudes: whole thousands and hundreds
    ['2500 feet', 'two thousand fife hundred feet'],
    ['500 feet', 'fife hundred feet'],
    ['not above 1500 feet', 'not above one thousand fife hundred feet'],
    ['10000 feet', 'one zero thousand feet'],
    // Flight levels digit by digit, no leading zero (Doc 9432 2.4.2: FL 95 -> niner five)
    ['flight level 65', 'flight level six fife'],
    ['FL 95', 'flight level niner fife'],
    ['FL 245', 'flight level two four fife'],
    // NATO alphabet: registrations, location indicators, single letters
    ['SP-TFA', 'sierra papa tango foxtrot alpha'],
    ['D-ATIS', 'delta alpha tango india sierra'],
    ['EPPO', 'echo papa papa oscar'],
    ['information L', 'information lima'],
    ['X-ray', 'xray'],
    // Abbreviations said as letters stay one word
    ['request FIS', 'request fis'],
    ['taxi to the GA apron', 'taxi to the ga apron'],
    // Diacritics and compound words
    ['Piła Radio', 'pila radio'],
    ['cleared for take-off', 'cleared for takeoff'],
  ])('%s -> %s', (variant, spoken) => {
    expect(forms(variant)[0]).toBe(spoken);
  });

  // Doc 9432 2.4; the second form is non-standard (recognized, marked almost)
  it.each([
    ['squawk 7000', ['squawk seven thousand', 'squawk seven zero zero zero']],
    ['squawk 6500', ['squawk six fife zero zero']],
    ['QNH 1000', ['qnh one thousand', 'qnh one zero zero zero']],
    ['heading 300', ['heading tree zero zero']],
    ['heading 330', ['heading tree tree zero']],
    ['flight level 100', ['flight level one hundred', 'flight level one zero zero']],
    ['flight level 180', ['flight level one eight zero']],
    ['11000 feet', ['one one thousand feet']],
    ['25000 feet', ['two fife thousand feet']],
    ['5000 metres', ['fife thousand metres']],
    ['10 miles north', ['one zero miles north']],
    ['18 knots', ['one eight knots']],
    ['118.125', ['one one eight decimal one two fife']],
    ['119.050', ['one one niner decimal zero fife zero']],
    ['124.140', ['one two four decimal one four zero']],
    ['122.500', ['one two two decimal fife', 'one two two decimal fife zero zero']],
    ['118.000', ['one one eight decimal zero', 'one one eight decimal zero zero zero']],
    ['122.1', ['one two two decimal one']],
    ['Cessna 172', ['cessna one seven two', 'cessna one seventy two']],
  ])('%s has the accepted forms %j', (variant, expected) => {
    expect(forms(variant)).toEqual(expected);
  });

  it('marks the words of a non-standard form with the standard one', () => {
    const [standard, digits] = expandToSpoken('squawk 7000');
    expect(standard.every((w) => !w.nonStandard)).toBe(true);
    expect(digits.slice(1).map((w) => w.nonStandard)).toEqual(Array(4).fill('seven thousand'));
  });

  it('marks words in square brackets as optional', () => {
    const [form] = expandToSpoken('not above [altitude] 1500 feet');
    expect(form.map((w) => `${w.word}${w.optional ? '?' : ''}`).join(' ')).toBe(
      'not above altitude? one thousand fife hundred feet',
    );
  });

  it('marks the words of a number with its value', () => {
    const [form] = expandToSpoken('QNH 998');
    expect(form[1].group).toEqual({ id: 0, value: '998', size: 3 });
    expect(form[0].group).toBeUndefined();
  });
});
