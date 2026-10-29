import { compareWords } from './compare';
import { tokenizeTranscript } from './transcript';

const words = (transcript: string) =>
  tokenizeTranscript(transcript)
    .map((w) => w.word)
    .join(' ');

describe('tokenizeTranscript', () => {
  it.each([
    // Words stay as heard: no digits, no letter groups
    ['Runway two one, cleared for take-off', 'runway two one cleared for takeoff'],
    ['three', 'three'],
    ['a', 'a'],
    // Bare letters are joined only into a known abbreviation
    ['q n h one zero one three', 'qnh one zero one three'],
    ['v f r flight', 'vfr flight'],
    ['s p q n h', 's p qnh'],
    ['s p t f a', 's p t f a'],
    ['x-ray', 'xray'],
    ['Piła Radio', 'pila radio'],
  ])('%s -> %s', (transcript, expected) => {
    expect(words(transcript)).toBe(expected);
  });

  it('keeps digits written by STT as one numeral token', () => {
    expect(tokenizeTranscript('contact 118.505')).toEqual([
      { word: 'contact' },
      { word: '118.505', numeral: '118.505' },
    ]);
  });

  it('carries the STT word confidence', () => {
    const heard = tokenizeTranscript('', [
      { word: 'q', confidence: 0.9 },
      { word: 'n', confidence: 0.7 },
      { word: 'h', confidence: 0.95 },
      { word: 'minor', confidence: 0.4 },
    ]);
    expect(heard).toEqual([
      { word: 'qnh', confidence: 0.7 },
      { word: 'minor', confidence: 0.4 },
    ]);
  });
});

describe('compareWords', () => {
  it.each([
    // STT writes the plain word for a well-spoken ICAO one, so both are correct
    ['tree', 'three', 'correct'],
    ['fife', 'five', 'correct'],
    ['four', 'fower', 'correct'],
    ['alpha', 'alfa', 'correct'],
    // STT keeps these apart: understandable, but not standard
    ['niner', 'nine', 'almost'],
    ['decimal', 'point', 'almost'],
    // Accent or STT slip on a radio word
    ['fife', 'fifa', 'almost'],
    // A different radio word is wrong, never a typo
    ['alpha', 'a', 'wrong'],
    ['alpha', 'eight', 'wrong'],
    ['four', 'five', 'wrong'],
    ['seven', 'eleven', 'wrong'],
    ['niner', 'minor', 'wrong'],
    // Regular words forgive STT typos
    ['downwind', 'downwin', 'correct'],
    ['clearance', 'clarence', 'almost'],
    ['via', 'fire', 'wrong'],
  ])('expected %s, heard %s -> %s', (expected, heard, match) => {
    expect(compareWords(expected, heard)).toBe(match);
  });
});
