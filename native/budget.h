#pragma once
#include <cstddef>

// Wrapper policy, not an LLVM format limit. See docs/architecture.md.
struct LimitExceeded {};
struct InvalidAst {};
struct Budget {
  size_t depth = 0;
  size_t steps = 0;
  size_t bytes = 0;
};
inline thread_local Budget budget;

struct ParseFrame {
  ParseFrame() {
    if (budget.depth >= 128 || ++budget.steps > 32768) throw LimitExceeded{};
    ++budget.depth;
  }
  ~ParseFrame() { --budget.depth; }
};

inline void reserveArena(size_t bytes) {
  if (bytes > 1024 * 1024 - budget.bytes) throw LimitExceeded{};
  budget.bytes += bytes;
}
