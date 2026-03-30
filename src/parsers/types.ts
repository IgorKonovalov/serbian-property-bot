export interface Listing {
  externalId: string
  source: string
  url: string
  title: string
  price: number | null // EUR
  size: number | null // m²
  plotSize: number | null // ares
  rooms: number | null
  area: string | null
  city: string | null
  imageUrl: string | null // thumbnail URL
}

export interface SearchParams {
  keywords: string // e.g. "Banatska kuća"
  area: string // e.g. "Novi Sad"
  minPrice?: number // EUR
  maxPrice?: number
  minSize?: number // m²
  maxSize?: number
  minPlotSize?: number // ares
}

export interface Parser {
  readonly source: string
  search(params: SearchParams): Promise<Listing[]>
}
