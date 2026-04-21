/**
 * Every domain aggregate exposes its underlying model via `getModel()`.
 * Repositories use this to persist changes (see `repository.ts`).
 */
export interface IAggregate<T> {
	getModel(): T;
}
