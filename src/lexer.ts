import chalk from "chalk"

export type Token = 
    ReturnType<typeof ExpressionAssignment> |
    ReturnType<typeof Newline> |
    ReturnType<typeof Indent> |
    ReturnType<typeof Outdent> |
    ReturnType<typeof Unknown> |
    ReturnType<typeof LiteralAssignment> |
    ReturnType<typeof Atom> |
    ReturnType<typeof SectionStart> |
    ReturnType<typeof EmptyObject>  |
    ReturnType<typeof EmptyList> |
    ReturnType<typeof OpenParen> |
    ReturnType<typeof CloseParen> |
    ReturnType<typeof Comment> |
    ReturnType<typeof Lift>

const ExpressionAssignment = unitToken("ExpressionAssignment")

const Lift = unitToken("^")
const Newline = (indent: number) => ({  type: "Newline",  indent} as const)
const Indent = unitToken("Indent")
const Outdent = unitToken("Outdent")

const Comment = unitToken("Comment")
const LiteralAssignment = (str: string) => ({ type: "LiteralAssignment", str } as const)
const Atom = (str: string, trailingWs: string) => ({ type: "Atom", str, trailingWs } as const)


const SectionStart = unitToken("SectionStart")
const OpenParen = unitToken("OpenParen")
const CloseParen = unitToken("CloseParen")
const Unit = unitToken("Unit")
const EmptyObject = unitToken("EmptyObject")
const EmptyList = unitToken("EmptyList")
const Unknown = (str: string) =>  ({  type: "Unknown",  str } as const)

function unitToken<T extends string>(type: T) {
    return () => ({ type } as const)
}

/// ----------------------------------------------------------------
/// Lexer
/// --------------------------------------------------------------------------

export function getTokens(fileContent: string) {
  const source = fileContent.replace(/\r\n/g, '\n')

  if (source.length === 0) {
    return []
  }

  if (source[source.length - 1] !== '\n') {
    source.concat('\n')
  }

  const tokens: Token[] = []

  let err = ''
  const errors = []

  let i = 0
  const indents: number[] = [0]
  while (i < source.length) {
    let result = getToken(source, i)
    let currentErr = ''
    while (result === false && i < source.length) {
      currentErr += source[++i]
      result = getToken(source, i)
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

    const [token, newIndex] = result

    if (newIndex <= i) {
      console.error("No progress made, stopping to avoid infinite loop: ", token)
      break
    }

    i = newIndex
    if (token) {
      if (token.type === "Newline") {
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

        while (token.indent < indents[indents.length - 1]) {
          indents.pop()
          tokens.push(Outdent())
        }
      } else {
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
  return tokens
}

function getToken(src: string, index: number): TokenResult {
  return pipeline(
    newline,
    comment,
    
    symbol("(", OpenParen),
    symbol(")", CloseParen),
    symbol("{}", EmptyObject),
    symbol("*", Lift),
    symbol("[]", EmptyList),
    literalAssignment,
    symbol(":=", ExpressionAssignment),
    symbol(":", ExpressionAssignment),
    
    symbol("---", SectionStart),
    atom,
  )(src, index)
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

function atom(src: string, index: number): TokenResult {
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

  return [Atom(str, ws), wsi]
}

function isDigit(char: string) {
  return char >= '0' && char <= '9'
}

const QUOTES = new Set(['"', "'"])

function literalAssignment(src: string, index: number): TokenResult {
  // TODO: handle more complex YAML literal assignments
  let i = index
  if (src[i] !== ':') 
    return false
  i = consumeWhitespace(src, i + 1)

  if (QUOTES.has(src[i])) 
    return quotedLiteral(src, i + 1)

  return unquotedLiteral(src, i)
  
}

function quotedLiteral(src: string, index: number): TokenResult {
  let i = index

  while (!QUOTES.has(src[i])) {
    i++
  }

  const str = src.slice(index, i)

  i = consumeWhitespace(src, i + 1)

  return [LiteralAssignment(str), i]
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

  return [LiteralAssignment(str), i]
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
  return (src, index) => {
    for (const fn of fns) {
      const result = fn(src, index)
      if (result) {
        return result
      }
    }
    return false
  }
}

type Char = string

type TokenResult = [Token, number] | false

type LexingFn = (src: string, index: number) => TokenResult

function assignment(src: string, index: number): TokenResult {
  let char = src[index];

  if (char === ':') {
    return [ExpressionAssignment(), consumeWhitespace(src, index + 1)]
  }

  return false

}

function symbol(match: string, fn: () => Token): LexingFn {
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