#include "budget.h"
#include "graph.h"
#include "llvm/Demangle/MicrosoftDemangle.h"
#include <cstring>
#include <string>

#pragma clang diagnostic push
#pragma clang diagnostic error "-Wswitch-enum"
#include "ast-fields.inc"
#pragma clang diagnostic pop

void Graph::write(Json &out, const Node *root) {
  out.raw("{");
  out.key("root");
  reference(out, root);
  out.key("nodes");
  out.raw("[");
  for (size_t index = 0; index < nodes.size(); ++index) {
    if (index) out.raw(",");
    out.raw("{");
    writeFields(*this, out, nodes[index]);
    out.raw("}");
  }
  out.raw("]");
  out.raw("}");
}

static char input[4097];
static std::string result;

static std::string failure(std::string_view status, std::string_view warning) {
  Json out;
  out.raw("{");
  out.key("status"); out.string(status);
  out.key("ast"); out.raw("null");
  out.key("consumed"); out.number(0);
  out.key("warnings"); out.raw("["); out.string(warning); out.raw("]");
  out.raw("}");
  return out.result();
}

static std::string parse(size_t length, unsigned mode) {
  budget = {};
  Demangler demangler;
  std::string_view remaining(input, length);
  Node *root = demangler.parse(remaining);
  if (demangler.Error || !root) return failure("invalid", "LLVM rejected the mangled name.");
  if (mode == 1) {
    if (input[0] != '.' || root->kind() != NodeKind::VariableSymbol)
      return failure("invalid", "Expected a dot-prefixed RTTI type name.");
    root = static_cast<VariableSymbolNode *>(root)->Type;
    if (!root) throw InvalidAst{};
  }
  Json out;
  out.raw("{");
  out.key("status"); out.string(remaining.empty() ? "success" : "partial");
  out.key("consumed"); out.number(length - remaining.size());
  out.key("ast"); Graph{}.write(out, root);
  out.key("warnings"); out.raw("[");
  if (!remaining.empty()) out.string("Trailing input was not consumed by LLVM.");
  out.raw("]"); out.raw("}");
  return out.result();
}

extern "C" char *input_buffer() { return input; }
static bool validInput(size_t length, unsigned mode) {
  if (!length || length > 4096 || mode > 1) return false;
  for (size_t index = 0; index < length; ++index) {
    if (input[index] < 0x20 || input[index] > 0x7e) return false;
  }
  return true;
}
extern "C" const char *demangle(size_t length, unsigned mode) {
  if (!validInput(length, mode))
    result = failure("invalid", "Invalid native input length or mode.");
  else {
    try { result = parse(length, mode); }
    catch (const LimitExceeded &) { result = failure("limit", "Demangling resource limit exceeded."); }
    catch (const InvalidAst &) { result = failure("error", "Unsupported or inconsistent LLVM AST."); }
  }
  return result.c_str();
}
extern "C" size_t result_size() { return result.size(); }
