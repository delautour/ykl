import chalk from "chalk"

export type Token =
  ReturnType<typeof Assignment> |
  ReturnType<typeof Newline> |
  ReturnType<typeof Indent> |
  ReturnType<typeof Outdent> |
  ReturnType<typeof Unknown> |
  ReturnType<typeof Symbol> |
  ReturnType<typeof SectionStart> |
  ReturnType<typeof EmptyObject> |
  ReturnType<typeof EmptyList> |
  ReturnType<typeof OpenParen> |
  ReturnType<typeof CloseParen> |
  ReturnType<typeof Comment> |
  ReturnType<typeof Lift> |
  ReturnType<typeof Pipeline> |
  ReturnType<typeof HardMerge> |
  ReturnType<typeof EOF> |
  ReturnType<typeof Fn> |
  ReturnType<typeof StringLit> |
  ReturnType<typeof NumberLit> |
  ReturnType<typeof SoftMerge> |
  ReturnType<typeof PatternMatch> |
  ReturnType<typeof Accessor> |
  ReturnType<typeof BoolLit>

/// ----------------------------------------------------------------
/// Token Constructors
/// --------------------------------------------------------------------------

const Assignment = (literal: boolean) => ({ type: "Assignment", literal } as const)
const Accessor = unitToken("Accessor")
const EOF = unitToken("EOF")
const Lift = unitToken("Lift")
const Pipeline = unitToken("Pipeline")
const HardMerge = unitToken("HardMerge")
const SoftMerge = unitToken("SoftMerge")
const Newline = (indent: number) => ({ type: "Newline", indent } as const)
const Indent = unitToken("Indent")
const Outdent = unitToken("Outdent")
const StringLit = (str: string) => ({ type: "String", str } as const)
const NumberLit = (num: number) => ({ type: "Number", num } as const)
const BoolLit = (bool: boolean) => ({ type: "Bool", bool } as const)
const PatternMatch = unitToken("PatternMatch")

const Comment = unitToken("Comment")
const Symbol = (str: string, trailingWs: string) => ({ type: "Symbol", str, trailingWs } as const)

const SectionStart = unitToken("SectionStart")
const OpenParen = unitToken("OpenParen")
const CloseParen = unitToken("CloseParen")
const EmptyObject = unitToken("EmptyObject")
const EmptyList = unitToken("EmptyList")
const Unknown = (str: string) => ({ type: "Unknown", str } as const)
const Fn = unitToken("Fn")

function unitToken<T extends string>(type: T) {
  return () => ({ type } as const)
}

/// ----------------------------------------------------------------
/// Lexer
/// --------------------------------------------------------------------------

export function getTokens(fileContent: string) {
  const source = fileContent.replace(/\r\n/g, '\n')

  if (source.length === 0) {
    return [EOF()]
  }

  if (source[source.length - 1] !== '\n') {
    source.concat('\n')
  }

  const tokens: Token[] = []

  let err = ''
  const errors = []

  let i = 0
  const indents: number[] = [0]
  while (i < source.length && source[i] === '\n') {
    i++
  }
  while (i < source.length) {
    let result = getToken(source, i, tokens)
    let currentErr = ''
    while (result === false && i < source.length) {
      currentErr += source[++i]
      result = getToken(source, i, tokens)
    }

    if (currentErr.length > 0) {
      const preamble = chalk.gray('...' + source.slice(Math.max(0, i - 20), i - currentErr.length + 1))
      const postamble = chalk.gray(source.slice(i + 1, Math.min(source.length, i + 20)) + '...')
      const contex = preamble + chalk.red(currentErr) + postamble
      const msg = chalk.red(`Unexpected character: "${currentErr.replace(/\n/g, '\\n')}" at index ${i - currentErr.length} \n\t`) + contex
      err += msg
      tokens.push(Unknown(currentErr))
      currentErr = ''

      continue
    }

    if (err.length > 0) {
      errors.push(err)
      err = ''
    }

    if (!result) {
      continue
    }

    const [token] = result

    if (result[1] <= i) {
      console.error("No progress made, stopping to avoid infinite loop: ", token)
      break
    }

    i = result[1]
    const nextTokens = Array.isArray(token) ? token : [token]

    for (const token of nextTokens) {
      switch (token?.type) {
        case undefined:
          break
        case "Newline":
          while (token.indent < indents[indents.length - 1]) {
            indents.pop()
            tokens.push(Outdent())
          }
          const lastToken = tokens[tokens.length - 1]
          if (lastToken && ((lastToken.type === "Newline" && lastToken.indent === token.indent) || lastToken.type === "Indent" || lastToken.type === "Outdent")) {
            // skip redundant newlines
            continue
          }

          if (token.indent === indents[indents.length - 1]) {
            tokens.push(token)
          }

          if (token.indent > indents[indents.length - 1]) {
            indents.push(token.indent)
            tokens.push(Indent())
          }

          break
        default:
          tokens.push(token)
      }
    }
  }

  if (err.length > 0) {
    errors.push(err)
    err = ''
  }

  for (const e of errors) {
    console.log(e)
  }

  while (indents.length > 1) {
    indents.pop()
    tokens.push(Outdent())
  }

  tokens.push(EOF())
  return tokens
}


function getToken(src: string, index: number, tkns: Token[]): TokenResult {
  return pipeline(
    newline,
    comment,
    atom("(", OpenParen),
    atom(")", CloseParen),
    atom("{}", EmptyObject),
    atom("[]", EmptyList),
    atom("->", Fn),
    atom("^", Lift),
    atom("|", Pipeline),
    atom("+", HardMerge),
    atom("+?", SoftMerge),
    atom("?", PatternMatch),
    assignments,
    atom(":", Accessor),
    atom("---", SectionStart),
    literalAssignment,
    symbol,
  )(src, consumeWhitespace(src, index), tkns)
}


function assignments(src: string, index: number): TokenResult {
  const current = src[index]
  const peek = src[index + 1]
  if (current !== ':') {
    return false
  }

  if (peek === ' ') {
    const ws = consumeWhitespace(src, index + 2)
    return [Assignment(true), ws]
  }

  if (peek === '=') {
    const ws = consumeWhitespace(src, index + 2)
    return [Assignment(false), ws]
  }
  if (peek === '\n' || peek === '\r') {

    return [Assignment(false), index + 1]
  }

  return false

}

function comment(src: string, index: number): TokenResult {
  if (src[index] !== '#') {
    return false
  }

  let i = index + 1
  while (src[i] !== '\n' && i < src.length) {
    i++
  }
  return [, i]
}

function symbol(src: string, index: number): TokenResult {
  let i = index

  function isNonWordChar(char: string) {
    return isWhitespace(char) || char === ':' || char === '\n' || char === '\r'
  }

  while (i < src.length && !isNonWordChar(src[i])) {
    i++
  }

  if (i === index) {
    return false
  }

  const str = src.slice(index, i)
  const wsi = consumeWhitespace(src, i)
  const ws = src.slice(i, wsi)

  return [Symbol(str, ws), wsi]
}

function isDigit(char: string) {
  return char >= '0' && char <= '9'
}

const QUOTES = new Set(['"', "'"])

function literalAssignment(src: string, index: number, tkns: Token[]): TokenResult {
  const previousToken = tkns[tkns.length - 1]
  if (previousToken?.type !== "Assignment" || !previousToken.literal) {
    return false
  }

  // TODO: handle more complex YAML literal assignments
  let i = index

  if (QUOTES.has(src[i])) {
    const quoted = quotedLiteral(src, i + 1)
    if (!quoted) {
      return false
    }
    return quoted
  }

  const unquoted = unquotedLiteral(src, i)
  return unquoted
}

function quotedLiteral(src: string, index: number): TokenResult {
  let i = index

  while (!QUOTES.has(src[i])) {
    i++
  }

  const str = src.slice(index, i)

  i = consumeWhitespace(src, i + 1)

  return [StringLit(str), i]
}


function unquotedLiteral(src: string, index: number): TokenResult {

  const terminalChars = new Set(['\n', '\r', "#"])
  let i = index
  let lastNonWhitespace = i

  while (i < src.length) {
    const current = src[i]
    if (terminalChars.has(current)) {
      break
    }

    i++
    if (!isWhitespace(current)) {
      lastNonWhitespace = i
    }
  }

  if (lastNonWhitespace === index) {
    return false
  }

  const str = src.slice(index, lastNonWhitespace)


  if (/^-?\d+(\.\d+)?$/.test(str)) {
    return [NumberLit(Number(str)), i]
  }

  if (/^(true)$/i.test(str)) {
    return [BoolLit(true), i]
  }
  if (/^(false)$/i.test(str)) {
    return [BoolLit(false), i]
  }

  return [StringLit(str), i]
}


function newline(src: string, index: number): TokenResult {
  let i = consumeWhitespace(src, index)

  if (src[i] !== '\n') {
    return false
  }
  i++

  let count = 0
  while (isWhitespace(src[i])) {
    count++
    i++
  }
  return [Newline(count), i]
}

function isWhitespace(char: Char): boolean {
  return char === ' ' || char === '\t'
}

function pipeline(...fns: LexingFn[]): LexingFn {
  return (src, index, tkns) => {
    for (const fn of fns) {
      const result = fn(src, index, tkns)
      if (result) {
        return result
      }
    }
    return false
  }
}

type Char = string

type TokenResult = [Token | Token[], number] | false

type LexingFn = (src: string, index: number, tkns: Token[]) => TokenResult

function atom(match: string, fn: () => Token): LexingFn {
  return (src: string, index: number): TokenResult => {
    if (!src.startsWith(match, index)) {
      return false
    }

    const ws = consumeWhitespace(src, index + match.length)
    return [fn(), ws]
  }
}

function consumeWhitespace(src: string, index: number): number {
  let i = index
  while (isWhitespace(src[i])) {
    i++
  }
  return i
}

function lift<T>(obj: T | T[]): T[] {

  if (Array.isArray(obj)) {
    return obj
  }
  return [obj]
}