import { normalize } from './normalize';

describe('normalize', () => {
  it.each([
    // Examples from the spec (section 12.2)
    ['one two one decimal eight', '121.8'],
    ['one two one eight zero zero', '121800'],
    ['runway two one', 'runway 21'],
    ['Sierra Papa Tango Foxtrot Alpha', 'sptfa'],
    ['SP-TFA', 'sptfa'],
    // Frequencies: trailing zeros are dropped so "118.350" == "118.35"
    ['one one eight decimal three five zero', '118.35'],
    ['118.350', '118.35'],
    ['121.900', '121.9'],
    ['one two one point niner', '121.9'],
    // ICAO pronunciation
    ['QNH one zero one six', 'qnh 1016'],
    ['heading tree six zero', 'heading 360'],
    ['fife miles north', '5 miles north'],
    // Cardinal numbers
    ['two thousand five hundred feet', '2500 feet'],
    ['3000 feet', '3000 feet'],
    ['ten miles north', '10 miles north'],
    // Letters and NATO words
    ['information Bravo', 'information b'],
    ['information B', 'information b'],
    ['via Alpha, Bravo', 'via ab'],
    ['S P T F A', 'sptfa'],
    ['x-ray', 'x'],
    ['Juliett', 'j'],
    // Punctuation, case, compound words
    ['Runway 21, cleared for take-off, SP-TFA.', 'runway 21 cleared for takeoff sptfa'],
    ['cleared for takeoff', 'cleared for takeoff'],
    ['Piła Traffic', 'pila traffic'],
    ['Poznań Ground', 'poznan ground'],
  ])('%s -> %s', (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });

  it('normalizes a full taxi readback', () => {
    expect(
      normalize(
        'Taxi to holding point runway two one via Alpha, Bravo, hold short runway two one, Sierra Papa Tango Foxtrot Alpha',
      ),
    ).toBe('taxi to holding point runway 21 via ab hold short runway 21 sptfa');
  });

  it('gives the same result for spoken and written forms', () => {
    expect(normalize('contact Ground on one two one decimal niner zero zero')).toBe(
      normalize('contact Ground on 121.900'),
    );
  });
});
