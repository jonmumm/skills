import { parse } from "yaml";
import { Config } from "./schemas.ts";

export function parseConfig(yamlText: string): Config {
  const result = Config.safeParse(parse(yamlText) ?? {});
  if (!result.success) {
    throw new Error(`Invalid sre-agent config:\n${result.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n")}`);
  }
  return result.data;
}
