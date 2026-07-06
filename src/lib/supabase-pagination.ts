type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      in: (column: string, values: string[]) => {
        range: (
          from: number,
          to: number
        ) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>
      }
    }
  }
}

type FetchRowsByIdsOptions = {
  chunkSize?: number
  pageSize?: number
}

export async function fetchRowsByIds<T>(
  supabase: unknown,
  table: string,
  columns: string,
  idColumn: string,
  ids: string[],
  options: FetchRowsByIdsOptions = {}
): Promise<T[]> {
  const chunkSize = options.chunkSize ?? 100
  const pageSize = options.pageSize ?? 1000
  const uniqueIds = [...new Set(ids.filter(Boolean))]
  const rows: T[] = []
  const db = supabase as SupabaseLike

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize)
    let from = 0

    while (true) {
      const { data, error } = await db
        .from(table)
        .select(columns)
        .in(idColumn, chunk)
        .range(from, from + pageSize - 1)

      if (error) throw new Error(error.message ?? `Failed to fetch ${table}`)

      const batch = (data ?? []) as T[]
      rows.push(...batch)

      if (batch.length < pageSize) break
      from += pageSize
    }
  }

  return rows
}
