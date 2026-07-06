const DEFAULT_REGION = 'Miền Bắc'

type QueryResult<T> = { data: T[] | null; error: { message: string } | null }
type SelectQuery<T> = PromiseLike<QueryResult<T>> & {
  eq: (column: string, value: unknown) => PromiseLike<QueryResult<T>>
}
type TableQuery<T> = { select: (columns: string) => SelectQuery<T> }
type SupabaseLike = { from: <T = unknown>(table: string) => TableQuery<T> }

type DepartmentRow = {
  id: string
  name: string
  code: string | null
  region: string | null
}

type LeaderRow = {
  id: string
  name: string
  region: string | null
}

type MatrixRow = {
  evaluator_id: string
  target_id: string
}

type EvaluationRow = {
  evaluator_id: string
  target_id: string
  status: string
}

export type RequiredEvaluationTask = {
  evaluatorId: string
  targetId: string
  evaluatorName: string
  targetName: string
  type: 'matrix' | 'leadership'
}

function labelDept(dept: DepartmentRow | undefined, fallback: string) {
  return dept ? (dept.code ?? dept.name) : fallback
}

export async function getEvaluationCompletion(supabaseClient: unknown, periodId: string) {
  const supabase = supabaseClient as SupabaseLike
  const [
    departmentsResult,
    leadersResult,
    matrixResult,
    evaluationsResult,
  ] = await Promise.all([
    supabase.from<DepartmentRow>('departments').select('id, name, code, region'),
    supabase.from<LeaderRow>('users').select('id, name, region').eq('role', 'leadership'),
    supabase.from<MatrixRow>('evaluation_matrix').select('evaluator_id, target_id').eq('period_id', periodId),
    supabase.from<EvaluationRow>('evaluations').select('evaluator_id, target_id, status').eq('period_id', periodId),
  ])

  if (departmentsResult.error) throw new Error(departmentsResult.error.message)
  if (leadersResult.error) throw new Error(leadersResult.error.message)
  if (matrixResult.error) throw new Error(matrixResult.error.message)
  if (evaluationsResult.error) throw new Error(evaluationsResult.error.message)

  const departments = departmentsResult.data ?? []
  const leaders = leadersResult.data ?? []
  const matrix = matrixResult.data ?? []
  const evaluations = evaluationsResult.data ?? []

  const deptById = new Map(departments.map(dept => [dept.id, dept]))
  const submitted = new Set(
    evaluations
      .filter(evaluation => evaluation.status === 'submitted')
      .map(evaluation => `${evaluation.evaluator_id}:${evaluation.target_id}`)
  )

  const required = new Map<string, RequiredEvaluationTask>()

  for (const row of matrix) {
    const evaluator = deptById.get(row.evaluator_id)
    const target = deptById.get(row.target_id)
    required.set(`${row.evaluator_id}:${row.target_id}`, {
      evaluatorId: row.evaluator_id,
      targetId: row.target_id,
      evaluatorName: labelDept(evaluator, row.evaluator_id),
      targetName: labelDept(target, row.target_id),
      type: 'matrix',
    })
  }

  for (const leader of leaders) {
    const leaderRegion = leader.region ?? DEFAULT_REGION
    for (const dept of departments) {
      if ((dept.region ?? DEFAULT_REGION) !== leaderRegion) continue
      required.set(`${leader.id}:${dept.id}`, {
        evaluatorId: leader.id,
        targetId: dept.id,
        evaluatorName: leader.name,
        targetName: labelDept(dept, dept.id),
        type: 'leadership',
      })
    }
  }

  const requiredTasks = [...required.values()]
  const incomplete = requiredTasks.filter(task => !submitted.has(`${task.evaluatorId}:${task.targetId}`))

  return {
    totalRequired: requiredTasks.length,
    submittedRequired: requiredTasks.length - incomplete.length,
    incomplete,
  }
}

export function completionErrorMessage(incompleteCount: number) {
  return `Chưa thể kết thúc kỳ đánh giá - còn ${incompleteCount} phiếu bắt buộc chưa hoàn thành.`
}
