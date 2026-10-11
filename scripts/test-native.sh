#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/fuzz-corpus.mjs
clang++ -std=c++17 -O1 -g -fno-omit-frame-pointer \
  -fsanitize=address,undefined -fno-sanitize-recover=all \
  -I .build/guarded -I .build/llvm/llvm/include -I native -I artifacts \
  native/bridge.cpp native/fuzz-driver.cpp .build/MicrosoftDemangle.cpp \
  .build/MicrosoftDemangleNodes.cpp .build/llvm/llvm/lib/Demangle/ItaniumDemangle.cpp \
  -o .build/fuzz-native
ASAN_OPTIONS=detect_leaks=1 .build/fuzz-native < .build/fuzz.txt
clang++ -std=c++17 -O1 -I .build/llvm/llvm/include native/oracle.cpp \
  .build/llvm/llvm/lib/Demangle/MicrosoftDemangle.cpp \
  .build/llvm/llvm/lib/Demangle/MicrosoftDemangleNodes.cpp \
  .build/llvm/llvm/lib/Demangle/ItaniumDemangle.cpp -o .build/oracle
.build/oracle < .build/upstream-names.txt > .build/oracle-results.txt
