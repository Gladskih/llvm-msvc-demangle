// Independent upstream parser, without the wrapper's safety patches or JSON serializer.
#include "llvm/Demangle/MicrosoftDemangle.h"
#include <iostream>
#include <string>
#include <string_view>

static std::string hex(std::string_view bytes) {
  if (bytes.empty()) return "-";
  const char digits[] = "0123456789abcdef";
  std::string text;
  for (unsigned char byte : bytes) {
    text += digits[byte >> 4];
    text += digits[byte & 15];
  }
  return text;
}

int main() {
  std::string input;
  while (std::getline(std::cin, input)) {
    llvm::ms_demangle::Demangler parser;
    std::string_view remaining(input);
    const auto *root = parser.parse(remaining);
    if (parser.Error || !root) { std::cout << "invalid 0 - -\n"; continue; }
    std::cout << (remaining.empty() ? "success" : "partial") << " "
              << input.size() - remaining.size() << " " << hex(root->toString()) << " ";
    if (input[0] == '.' && root->kind() == llvm::ms_demangle::NodeKind::VariableSymbol)
      std::cout << hex(static_cast<const llvm::ms_demangle::VariableSymbolNode *>(root)
                        ->Type->toString());
    else std::cout << "-";
    std::cout << "\n";
  }
}
