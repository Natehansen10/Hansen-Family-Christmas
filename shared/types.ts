export type Role = 'santa' | 'kid' | 'grandkid'
export type Priority = 'must' | 'love' | 'stocking'
export type ClaimStatus = 'claimed' | 'bought' | 'wrapped' | 'under_tree'

export const PRIORITIES: Priority[] = ['must', 'love', 'stocking']
export const CLAIM_STATUSES: ClaimStatus[] = ['claimed', 'bought', 'wrapped', 'under_tree']

export interface Person {
  id: string
  name: string
  role: Role
  /** ids of the people who manage this list (grandkids only) */
  managers: string[]
}

/** What the browser is allowed to know about a person. */
export interface PublicPerson extends Person {
  /** true once a vault code is set. Grandkids never have one. */
  hasCode: boolean
}

export interface Token {
  id: string
  name: string
  mono: string
  num: string
  ownerId: string | null
}

export interface Claim {
  claimerId: string
  status: ClaimStatus
}

export interface Wish {
  id: string
  ownerId: string
  addedBy: string
  url: string | null
  title: string
  imageUrl: string | null
  store: string | null
  priceCents: number | null
  priority: Priority
  notes: string | null
  createdAt: string
}

/**
 * A wish as sent to one specific viewer. `claim` is PRESENT ONLY when that
 * viewer may see status on the owner's list. When hidden the key is absent,
 * not null, so there is nothing to find in dev tools.
 */
export interface BoardWish extends Wish {
  claim?: Claim | null
  /** only ever set alongside a visible claim: the owner removed a wish someone already claimed */
  removed?: true
}

export interface Board {
  viewerId: string | null
  people: PublicPerson[]
  tokens: Token[]
  wishes: BoardWish[]
  realtime: { url: string; key: string } | null
}

export interface LedgerRow extends Wish {
  claim: Claim | null
  removed: boolean
}

export interface Unfurled {
  url: string
  title: string | null
  imageUrl: string | null
  store: string | null
  priceCents: number | null
}

export interface WishInput {
  ownerId: string
  url?: string | null
  title: string
  imageUrl?: string | null
  store?: string | null
  priceCents?: number | null
  priority: Priority
  notes?: string | null
}
