export function validateInput(input) {
  if (typeof input !== "string") return "Expected a string.";
  if (input.length === 0) return "The mangled name is empty.";
  if (input.length > 4096) return "Mangled names are limited to 4096 bytes.";
  for (let index = 0; index < input.length; ++index) {
    if (input.charCodeAt(index) < 0x20 || input.charCodeAt(index) > 0x7e) {
      return "Expected printable ASCII without embedded NUL bytes.";
    }
  }
  return null;
}
