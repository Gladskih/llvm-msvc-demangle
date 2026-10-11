export interface Ast {
  root: NodeId;
  nodes: AstNode[];
}
export type DemangleResult = {
  status: "success" | "partial";
  consumed: number;
  ast: Ast;
  warnings: string[];
} | {
  status: "invalid" | "limit" | "error";
  consumed: number;
  ast: null;
  warnings: string[];
};
/** Adds LLVM's native presentation, preserving success/failure discrimination. */
export type DemangleWithTextResult =
  | (Extract<DemangleResult, { ast: Ast }> & { text: string })
  | (Extract<DemangleResult, { ast: null }> & { text: null });

/** Local WASM loading configuration. Supply bytes for fully offline operation. */
export interface WasmSource {
  wasmBinary?: Uint8Array;
  /** Local file path or file URL in Node; same-origin URL in browsers. */
  wasmURL?: string | URL;
}
export interface Demangler {
  demangle(symbol: string): DemangleResult;
  /** Parse the dot-prefixed name stored in an MSVC RTTI TypeDescriptor. */
  demangleType(name: string): DemangleResult;
  /** Return the symbol AST and LLVM's native OF_Default presentation from one parse. */
  demangleWithText(symbol: string): DemangleWithTextResult;
  /** Return the RTTI type AST and its native presentation, without the synthetic symbol. */
  demangleTypeWithText(name: string): DemangleWithTextResult;
}
export function createDemangler(source?: WasmSource): Promise<Demangler>;
