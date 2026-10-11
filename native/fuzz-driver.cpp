#include <cstring>
#include <cstdlib>
#include <iostream>
#include <string>
#include "llvm/Demangle/Demangle.h"

extern "C" char *input_buffer(size_t);
extern "C" const char *demangle(size_t, unsigned);
extern "C" const char *demangle_with_text(size_t, unsigned);

static bool consistent(const char *result, const std::string &input) {
  if (!std::strstr(result, "\"status\":\"error\"")) return true;
  std::cerr << "Inconsistent AST for " << input << "\n";
  return false;
}

int main() {
  int status = 0;
  char *text = llvm::microsoftDemangle("?f@@YAHH@Z", nullptr, &status);
  const bool valid = text && status == llvm::demangle_success &&
    std::strcmp(text, "int __cdecl f(int)") == 0;
  std::free(text);
  if (!valid) return 1;
  std::string input;
  size_t count = 0;
  while (std::getline(std::cin, input)) {
    char *buffer = input_buffer(input.size());
    if (!buffer) return 2;
    std::memcpy(buffer, input.data(), input.size());
    if (!consistent(demangle(input.size(), 0), input) ||
        !consistent(demangle_with_text(input.size(), 0), input) ||
        !consistent(demangle_with_text(input.size(), 1), input)) return 1;
    ++count;
  }
  std::cerr << "Sanitizers checked " << count << " names.\n";
}
