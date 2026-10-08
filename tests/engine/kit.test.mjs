import test from 'node:test';
import assert from 'node:assert/strict';
import { sn } from '../../app/ui/kit.js';

test('pitch labels keep short names whole and shorten long ones to initial and surname', () => {
  assert.equal(sn('Zidane'), 'Zidane');
  assert.equal(sn('Luís Figo'), 'Luís Figo');
  assert.equal(sn('Roberto Carlos da Silva'), 'R. da Silva');
  assert.equal(sn('Georges Carnus'), 'G. Carnus');
});

test('a surname keeps its particles, in either case, but never absorbs the given name', () => {
  assert.equal(sn('Marco van Basten'), 'M. van Basten');
  assert.equal(sn('Vicente del Bosque'), 'V. del Bosque');
  assert.equal(sn('Kevin De Bruyne'), 'K. De Bruyne');
  assert.equal(sn('Rafael van der Vaart'), 'R. van der Vaart');
  assert.equal(sn('Alexis Mac Allister'), 'A. Mac Allister');
  assert.equal(sn('De la Peña Fernández'), 'D. Fernández');
});
