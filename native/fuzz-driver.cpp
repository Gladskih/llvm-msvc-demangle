#include <cstring>
#include <iostream>
#include <string>

extern "C" char *input_buffer();
extern "C" const char *demangle(size_t, unsigned);

int main() {
  std::string input;
  size_t count = 0;
  while (std::getline(std::cin, input)) {
    if (input.size() > 4096) return 2;
    std::memcpy(input_buffer(), input.data(), input.size());
    const char *result = demangle(input.size(), 0);
    if (std::strstr(result, "\"status\":\"error\"")) {
      std::cerr << "Inconsistent AST for " << input << "\n";
      return 1;
    }
    ++count;
  }
  std::cerr << "Sanitizers checked " << count << " names.\n";
}
