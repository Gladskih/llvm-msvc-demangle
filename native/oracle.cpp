// Independent upstream parser, without the wrapper's generated guards or JSON serializer.
#include "llvm/Demangle/MicrosoftDemangle.h"
#include <iostream>
#include <string>
#include <string_view>

int main() {
  std::string input;
  while (std::getline(std::cin, input)) {
    llvm::ms_demangle::Demangler parser;
    std::string_view remaining(input);
    const auto *root = parser.parse(remaining);
    if (parser.Error || !root) std::cout << "invalid 0\n";
    else std::cout << (remaining.empty() ? "success" : "partial") << " "
                   << input.size() - remaining.size() << "\n";
  }
}
