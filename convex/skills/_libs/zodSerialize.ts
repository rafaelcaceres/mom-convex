import { type ZodType, z } from "zod";

/**
 * Serialize a zod schema to a JSON-schema string, for persistence in
 * `skillCatalog.zodSchemaJson`. We use zod 4's built-in `z.toJSONSchema`
 * — no separate `zod-to-json-schema` package needed.
 */
export function zodToJsonSchemaString(schema: ZodType): string {
	return JSON.stringify(z.toJSONSchema(schema));
}
