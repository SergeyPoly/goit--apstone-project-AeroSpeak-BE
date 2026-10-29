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
    // Flight levels below 100 keep the leading zero
    ['flight level 65', 'flight level zero six fife'],
    ['FL 065', 'flight level zero six fife'],
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

  it.each([
    ['squawk 7000', ['squawk seven zero zero zero', 'squawk seven thousand']],
    ['heading 300', ['heading tree zero zero', 'heading tree hundred']],
    ['heading 330', ['heading tree tree zero']],
    ['flight level 100', ['flight level one zero zero', 'flight level one hundred']],
    ['122.500', ['one two two decimal fife zero zero', 'one two two decimal fife']],
    ['118.505', ['one one eight decimal fife zero fife']],
    ['Cessna 172', ['cessna one seven two', 'cessna one seventy two']],
    ['10 miles north', ['one zero miles north', 'ten miles north']],
  ])('%s has the accepted forms %j', (variant, expected) => {
    expect(forms(variant)).toEqual(expected);
  });

  it('marks the words of a number with its value', () => {
    const [form] = expandToSpoken('QNH 998');
    expect(form[1].group).toEqual({ id: 0, value: '998', size: 3 });
    expect(form[0].group).toBeUndefined();
  });
});
