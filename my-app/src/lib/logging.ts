type LogLevel = "log" | "warn" | "error";

export function structuredLog(
  moduleName: string,
  action: string,
  data: unknown,
  level: LogLevel = "log"
) {
  const message = `[${moduleName}] ${action} -> DATA`;

  if (level === "error") {
    console.error(message, data);
    return;
  }

  if (level === "warn") {
    console.warn(message, data);
    return;
  }

  console.log(message, data);
}