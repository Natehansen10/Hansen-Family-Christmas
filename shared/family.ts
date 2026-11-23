import type { Person, Token } from './types.js'

/** The Hansens. Seeded identically in supabase/migrations. */
export const PEOPLE: Person[] = [
  { id: 'jen', name: 'Jen', role: 'santa', managers: [] },
  { id: 'curtis', name: 'Curtis', role: 'santa', managers: [] },
  { id: 'lindsay', name: 'Lindsay', role: 'kid', managers: [] },
  { id: 'aj', name: 'AJ', role: 'kid', managers: [] },
  { id: 'nate', name: 'Nate', role: 'kid', managers: [] },
  { id: 'lydia', name: 'Lydia', role: 'kid', managers: [] },
  { id: 'josh', name: 'Josh', role: 'kid', managers: [] },
  { id: 'katie', name: 'Katie', role: 'kid', managers: [] },
  { id: 'gabriel', name: 'Gabriel', role: 'kid', managers: [] },
  { id: 'frankie', name: 'Frankie', role: 'grandkid', managers: ['lindsay', 'aj'] },
  { id: 'bo', name: 'Bo', role: 'grandkid', managers: ['lindsay', 'aj'] },
  { id: 'honey', name: 'Honey', role: 'grandkid', managers: ['nate', 'lydia'] },
]

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI']

/** The sixteen pieces. Ids match public/models/figurines/<id>.glb in the asset contract. */
export const TOKENS: Token[] = (
  [
    ['santa', 'Santa Claus', 'S'],
    ['mrsclaus', 'Mrs. Claus', 'C'],
    ['headelf', 'The Head Elf', 'E'],
    ['nutcracker', 'The Nutcracker', 'N'],
    ['sugarplum', 'Sugar Plum Fairy', 'F'],
    ['scrooge', 'Ebenezer Scrooge', 'S'],
    ['tinytim', 'Tiny Tim', 'T'],
    ['gingerbread', 'Gingerbread Man', 'G'],
    ['jackfrost', 'Jack Frost', 'J'],
    ['krampus', 'Krampus', 'K'],
    ['comet', 'Comet', 'C'],
    ['toysoldier', 'Toy Soldier', 'T'],
    ['rudolph', 'Rudolph', 'R'],
    ['frosty', 'Frosty', 'F'],
    ['grinch', 'The Grinch', 'G'],
    ['buddy', 'Buddy the Elf', 'B'],
  ] as const
).map(([id, name, mono], i) => ({ id, name, mono, num: NUMERALS[i], ownerId: null }))

export const TOKEN_META: Record<string, { mono: string; num: string }> = Object.fromEntries(
  TOKENS.map((t) => [t.id, { mono: t.mono, num: t.num }]),
)
