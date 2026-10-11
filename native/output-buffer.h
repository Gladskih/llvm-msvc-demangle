#pragma once
#include "llvm/Demangle/Utility.h"
#include <cstdlib>

// LLVM normally frees these buffers manually. Limits may unwind an intermediate print.
class ManagedOutputBuffer : public llvm::itanium_demangle::OutputBuffer {
public:
  ~ManagedOutputBuffer() override { std::free(getBuffer()); }
};
