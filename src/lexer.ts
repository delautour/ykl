import chalk from "chalk"

interface TokenBase {
  type: string
  start: number
  end: number
}

export type Token =
  Assignment |
  Newline |
  Indent |
  Outdent |
  Unknown |
  Symbol |
  SectionStart |
  EmptyObject |
  EmptyList |
  OpenParen |
  CloseParen |
  Comment |
  Lift |
  Pipeline |
  HardMerge |
  EOF |
  Fn |
  StringLit |
  NumberLit |
  SoftMerge |
  PatternMatch |
  Accessor |
  BoolLit | 
  Hyphen


type Assignment = TokenBase & { type: "Assignment", literal: boolean }
type Newline = TokenBase & { type: "Newline", indent: number }
type Hyphen = TokenBase & { type: "Hyphen", indent: number, column: number }
type StringLit = TokenBase & { type: "String", str: string }
type NumberLit = TokenBase & { type: "Number", num: number }
type BoolLit = TokenBase & { type: "Bool", bool: boolean }
type Symbol = TokenBase & { type: "Symbol", str: string }
type Unknown = TokenBase & { type: "Unknown", str: string }


type Indent = TokenBase & { type: "Indent" }
type Outdent = TokenBase & { type: "Outdent" }
type Accessor = TokenBase & { type: "Accessor" }
type EOF = TokenBase & { type: "EOF" }
type Lift = TokenBase & { type: "Lift" }
type Pipeline = TokenBase & { type: "Pipeline" }
type HardMerge = TokenBase & { type: "HardMerge" }
type SoftMerge = TokenBase & { type: "SoftMerge" }
type PatternMatch = TokenBase & { type: "PatternMatch" }
type Comment = TokenBase & { type: "Comment" }
type SectionStart = TokenBase & { type: "SectionStart" }
type OpenParen = TokenBase & { type: "OpenParen" }
type CloseParen = TokenBase & { type: "CloseParen" }
type EmptyObject = TokenBase & { type: "EmptyObject" }
type EmptyList = TokenBase & { type: "EmptyList" }
type Fn = TokenBase & { type: "Fn" }


/// ----------------------------------------------------------------
/// Token Constructors
/// --------------------------------------------------------------------------

const Assignment = (literal: boolean, start: number, end: number ) => ({ type: "Assignment", literal, start, end } as const)
const Newline = (indent: number, start: number, end: number ) => ({ type: "Newline", indent, start, end } as const)
const Hyphen = (indent: number, column: number, start: number, end: number ) => ({ type: "Hyphen", indent, column , start, end } as const)
const StringLit = (str: string, start: number, end: number) => ({ type: "String", str, start, end } as const)
const NumberLit = (num: number, start: number, end: number) => ({ type: "Number", num, start, end } as const)
const BoolLit = (bool: boolean, start: number, end: number) => ({ type: "Bool", bool, start, end } as const)
const Symbol = (str: string, start: number, end: number) => ({ type: "Symbol", str, start, end } as const)
const Unknown = (str: string, start: number, end: number) => ({ type: "Unknown", str, start, end } as const)

const Indent = unitToken("Indent")
const Outdent = unitToken("Outdent")
const Accessor = unitToken("Accessor")
const EOF = unitToken("EOF")
const Lift = unitToken("Lift")
const Pipeline = unitToken("Pipeline")
const HardMerge = unitToken("HardMerge")
const SoftMerge = unitToken("SoftMerge")
const PatternMatch = unitToken("PatternMatch")
const Comment = unitToken("Comment")
const SectionStart = unitToken("SectionStart")
const OpenParen = unitToken("OpenParen")
const CloseParen = unitToken("CloseParen")
const EmptyObject = unitToken("EmptyObject")
const EmptyList = unitToken("EmptyList")
const Fn = unitToken("Fn")

function unitToken<T extends string>(type: T) {
  return (start: number, end: number) => ({ type, start, end } as const)
}

/// ----------------------------------------------------------------
/// Lexer
/// --------------------------------------------------------------------------

export function getTokens(fileContent: string) {
  const source = fileContent.replace(/\r\n/g, '\n')

  if (source.length === 0) {
    return [EOF(fileContent.length, fileContent.length)]
  }

  if (source[source.length - 1] !== '\n') {
    source.concat('\n')
  }

  const tokens: Token[] = []

  let err = ''
  const errors = []

  let i = 0
  let lineNumber = 1
  const indents: number[] = [0]
  while (i < source.length && source[i] === '\n') {
    lineNumber++
    i++
  }
  while (i < source.length) {
    let newTokens = [...getToken(source, i, tokens)]
    let currentErr = ''
    
    let errorStart = i
    while (newTokens.length === 0 && i < source.length) {
      currentErr += source[++i]
      newTokens = [...getToken(source, i, tokens)]
    }

    if (errorStart < i) {
      const preamble = chalk.gray('...' + source.slice(Math.max(0, i - 20), i - currentErr.length + 1))
      const postamble = chalk.gray(source.slice(i + 1, Math.min(source.length, i + 20)) + '...')
      const contex = preamble + chalk.red(currentErr) + postamble
      const msg = chalk.red(`Unexpected character: "${currentErr.replace(/\n/g, '\\n')}" at index ${errorStart} \n\t`) + contex
      err += msg
      tokens.push(Unknown(currentErr, errorStart, i))
      currentErr = ''
      continue
    }

    if (err.length > 0) {
      errors.push(err)
      err = ''
    }

    for (const token of newTokens) {
      switch (token?.type) {
        case undefined:
          throw new Error('Undefined token type')
        case "Comment":
          break
        case "Hyphen":
          if (token.column !== indents.at(-1) && token.column !== indents.at(-1) + .5) {
            throw "Hyhpen not supported outside of lists yet"
          }else {
            if (tokens.at(-1)?.type === "Newline") {
              // Here we insert a half indent for the new-line, then a full indent for the hyphen
              // this means that items in lists are indented one level more than the surrounding context
              // for the surrounding contentx the outdent must be < both the column, and also the half indent because only full spaces can be typed
              
              indents.push(token.column - .5)
              tokens.pop()
              tokens.push(Indent(token.start, token.end))
            }
            indents.push(token.indent)
            tokens.push(Indent(token.start, token.end))
          }

          break
        case "Newline":
          lineNumber++
          while (token.indent < indents[indents.length - 1]) {
            indents.pop()
            tokens.push(Outdent(token.start+1, token.end))
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
            tokens.push(Indent(token.start, token.end))
          }

          break
        default:
          tokens.push(token)
      }
    }
    const advanceTo = consumeWhitespace(source, newTokens[newTokens.length -1].end)
    if (i < advanceTo) {
      i = advanceTo
    } else {
      console.error('Lexer did not advance! ', tokens[tokens.length -1])
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
    tokens.push(Outdent(source.length, source.length))
  }

  tokens.push(EOF(source.length, source.length))
  return tokens
}


function getToken(src: string, index: number, tkns: Token[]): TokenResult {
  const nextIndex = consumeWhitespace(src, index)
  return pipeline(
    newline,
    comment,
    atom("---", SectionStart),
    hyphen,
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
    
    literalAssignment,
    symbol,
  )(src, nextIndex, tkns)
}


function* assignments(src: string, index: number): TokenResult {
  const current = src[index]
  const peek = src[index + 1]
  if (current !== ':') {
    return
  }

  if (isWhitespace(peek)) {
    yield Assignment(true, index, index + 1)
    return
  }

  if (peek === '=') {
    yield Assignment(false, index, index + 2)
    return  
  }
  if (peek === '\n' || peek === '\r') {
    yield Assignment(false, index, index + 1)
    return  
  }  
}

function* comment(src: string, index: number): TokenResult {
  if (src[index] !== '#') {
    return
  }

  let i = index + 1
  while (src[i] !== '\n' && i < src.length) {
    i++
  }
  yield Comment(index, i)
}



function* symbol(src: string, index: number): TokenResult {
  let i = index

  function isNonWordChar(char: string) {
    return isWhitespace(char) || char === ':'     || 
    char === '\n' || char === '\r' || 
     char === '(' || char === ')' || 
     char === '#'  || char === '{' || char === '}' ||
     char === '[' || char === ']' || 
     char === '-' || char === '>' || char === '^' || char === '|' || char === '+' || char === '?' || char === '='
  }

  while (i < src.length && !isNonWordChar(src[i])) {
    i++
  }

  if (i === index) {
    return
  }

  const str = src.slice(index, i)
  yield Symbol(str, index, i)
  return
}

const QUOTES = new Set(['"', "'"])

function* literalAssignment(src: string, index: number, tkns: Token[]): Generator<Token> {
  const previousToken = tkns[tkns.length - 1]
  if (previousToken?.type !== "Assignment" || !previousToken.literal) {
    return
  }

  // TODO: handle more complex YAML literal assignments
  let i = index

  if (QUOTES.has(src[i])) {
    const quoted = quotedLiteral(src, i + 1)
    if (!quoted) {
      return
    }
    yield quoted
    return
  }

  yield* unquotedLiteral(src, i)
}

function quotedLiteral(src: string, index: number): Token {
  let i = index

  while (!QUOTES.has(src[i])) {
    i++
  }

  const str = src.slice(index, i)
  return StringLit(str, index, i + 1)
}


function* unquotedLiteral(src: string, index: number): TokenResult {
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
    return
  }

  const str = src.slice(index, lastNonWhitespace)

  if (/^-?\d+(\.\d+)?$/.test(str)) {
    yield NumberLit(Number(str) , index, lastNonWhitespace)
    return
  }

  if (/^(true)$/i.test(str)) {
    yield   BoolLit(true, index, lastNonWhitespace)
    return
  }
  if (/^(false)$/i.test(str)) {
    yield BoolLit(false, index, lastNonWhitespace)
    return
  }

  yield StringLit(str, index, lastNonWhitespace)
}


function* newline(src: string, index: number): Generator<Token> {
  let i = index

  if (src[i] !== '\n') {
    return
  }
  i++

  let count = 0
  while (isWhitespace(src[i])) {
    count++
    i++
  }
  yield Newline(count, index, i)
}

function* hyphen(src: string, index: number): Generator<Token> {
  let i = index
  if (src[i] !== '-') {
    return
  }

  while (isWhitespace(src[--i])) {}
  if (src[i] !== '\n' ){
    return 
  }

  const column = index - i - 1
  i =  index 
  while (isWhitespace(src[++i])) { }
  const indent = column + i - index

  yield Hyphen(indent, column, index, i)
}


function isWhitespace(char: Char): boolean {
  return char === ' ' || char === '\t'
}

function pipeline(...fns: LexingFn[]): LexingFn {

  return function* (src, index, tkns): Generator<Token> {


    const results = fns
      .map(fn => [...fn(src, index, tkns)])
      .filter(r => r.length > 0)

        
      .sort((a, b) => b[b.length -1].end - a[a.length -1].end)
    if (results.length === 0) {
      return
    }
    yield* results[0]
  }
}

type Char = string

type TokenResult = Generator<Token>

type LexingFn = (src: string, index: number, tkns: Token[]) => Generator<Token>

function atom(match: string, fn: (start: number, end: number) => Token): LexingFn {
  return function* (src: string, index: number): Generator<Token> {
    if (!src.startsWith(match, index)) {
      return
    }

    yield fn(index, index + match.length)
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