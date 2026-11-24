import { describe, expect, it } from 'vitest'
import { PEOPLE } from '../shared/family.js'
import { canClaim, canEdit, canSeeStatus } from '../shared/permissions.js'

/**
 * The 12 x 12 spoiler-shield matrix, written out by hand from design/PROMPT.md
 * section 2 so the test does not just restate the implementation.
 * Rows are viewers, columns are list owners, in this order:
 */
const ORDER = ['jen', 'curtis', 'lindsay', 'aj', 'nate', 'lydia', 'josh', 'katie', 'gabriel', 'frankie', 'bo', 'honey']

// prettier-ignore
const SEE: Record<string, string> = {
  //        J C  L A N L J K G  F B H
  jen:     '.X' + 'XXXXXXX' + 'XXX', // every list except her own
  curtis:  'X.' + 'XXXXXXX' + 'XXX',
  lindsay: 'XX' + '.......' + '...', // kids: Jen and Curtis only. Not Frankie or Bo, whom she manages.
  aj:      'XX' + '.......' + '...',
  nate:    'XX' + '.......' + '...', // not Honey, whom he manages
  lydia:   'XX' + '.......' + '...',
  josh:    'XX' + '.......' + '...',
  katie:   'XX' + '.......' + '...',
  gabriel: 'XX' + '.......' + '...',
  frankie: '..' + '.......' + '...', // grandkids never get a status view
  bo:      '..' + '.......' + '...',
  honey:   '..' + '.......' + '...',
}

const MANAGES: Record<string, string[]> = {
  lindsay: ['frankie', 'bo'],
  aj: ['frankie', 'bo'],
  nate: ['honey'],
  lydia: ['honey'],
}

const P = Object.fromEntries(PEOPLE.map((p) => [p.id, p]))

describe('spoiler shield: every viewer x owner pair', () => {
  it('covers exactly the 12 Hansens', () => {
    expect(PEOPLE.map((p) => p.id)).toEqual(ORDER)
    expect(Object.keys(SEE)).toEqual(ORDER)
  })

  let pairs = 0
  for (const viewer of ORDER) {
    for (const [i, owner] of ORDER.entries()) {
      pairs++
      const expected = SEE[viewer][i] === 'X'
      it(`${viewer} ${expected ? 'sees' : 'never sees'} status on ${owner}'s list`, () => {
        expect(canSeeStatus(P[viewer], P[owner])).toBe(expected)
        expect(canClaim(P[viewer], P[owner])).toBe(expected)
      })
      const editable = viewer === owner || (MANAGES[viewer] ?? []).includes(owner)
      it(`${viewer} ${editable ? 'can' : 'cannot'} edit ${owner}'s list`, () => {
        expect(canEdit(P[viewer], P[owner])).toBe(editable)
      })
    }
  }
  it('checked 144 pairs', () => expect(pairs).toBe(144))

  it('nobody sees status on their own list', () => {
    for (const p of PEOPLE) expect(canSeeStatus(p, p)).toBe(false)
  })

  it('a visitor with no session sees and edits nothing', () => {
    for (const p of PEOPLE) {
      expect(canSeeStatus(null, p)).toBe(false)
      expect(canEdit(null, p)).toBe(false)
    }
  })
})
