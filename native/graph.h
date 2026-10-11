#pragma once
#include "json.h"
#include "llvm/Demangle/MicrosoftDemangleNodes.h"
#include <unordered_map>
#include <vector>

using namespace llvm::ms_demangle;

class Graph {
  std::vector<const Node *> nodes;
  std::unordered_map<const Node *, size_t> identifiers;
public:
  void reference(Json &out, const Node *node) {
    if (!node) { out.raw("null"); return; }
    auto entry = identifiers.find(node);
    if (entry != identifiers.end()) { out.number(entry->second); return; }
    if (nodes.size() >= 4096) throw LimitExceeded{};
    const size_t index = nodes.size();
    identifiers.emplace(node, index);
    nodes.push_back(node);
    out.number(index);
  }
  void array(Json &out, Node *const *values, size_t count) {
    if (count > 4096 || (count && !values)) throw InvalidAst{};
    out.raw("[");
    for (size_t index = 0; index < count; ++index) {
      if (index) out.raw(",");
      reference(out, values[index]);
    }
    out.raw("]");
  }
  void offsets(Json &out, const TemplateParameterReferenceNode &node) {
    if (node.ThunkOffsetCount < 0 || node.ThunkOffsetCount > 3) throw InvalidAst{};
    out.raw("[");
    for (int index = 0; index < node.ThunkOffsetCount; ++index) {
      if (index) out.raw(",");
      out.string(std::to_string(node.ThunkOffsets[index]));
    }
    out.raw("]");
  }
  void write(Json &out, const Node *root);
};
