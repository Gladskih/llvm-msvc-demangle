#pragma once
#include "budget.h"
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

class Json {
  std::string text;
  std::vector<bool> first;
  void append(std::string_view value) {
    if (text.size() + value.size() > 1024 * 1024) throw LimitExceeded{};
    text.append(value);
  }
public:
  void raw(std::string_view value) {
    if (value == "{") first.push_back(true);
    if (value == "}") first.pop_back();
    append(value);
  }
  void string(std::string_view value) {
    raw("\"");
    for (unsigned char byte : value) {
      if (byte >= 0x20 && byte < 0x7f && byte != '"' && byte != '\\') {
        append(std::string_view(reinterpret_cast<const char *>(&byte), 1));
      } else {
        // Preserve upstream string bytes exactly as U+0000..U+00FF, including invalid UTF-8.
        const char hex[] = "0123456789abcdef";
        const char escape[] = {'\\', 'u', '0', '0', hex[byte >> 4], hex[byte & 15]};
        raw(std::string_view(escape, sizeof(escape)));
      }
    }
    raw("\"");
  }
  void key(std::string_view name) {
    if (!first.back()) raw(",");
    first.back() = false;
    string(name);
    raw(":");
  }
  template <class Integer> void number(Integer value) { raw(std::to_string(value)); }
  void boolean(bool value) { raw(value ? "true" : "false"); }
  const std::string &result() const { return text; }
};
