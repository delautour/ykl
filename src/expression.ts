
import { Cardinality } from './type_system.ts'
import * as l from './lexer.ts'
import { Stream } from './stream.ts'

export type AssignmentExpression = {
  type: "Assignment"
  key: string
  expr: Expression
  cardinality: () => Cardinality
}

export type MergeExpression = {
  readonly type: "Merge"
  readonly lhs:  Expression
  readonly rhs:  Expression
  readonly cardinality: () => Cardinality
}

export type YieldExpression = {
  readonly type: "Yield"
  readonly inner: Expression
  readonly cardinality: () => Cardinality
}

export type LiftExpression = {
  readonly type: "Lift"
  readonly expr: Expression
  readonly cardinality: () => Cardinality
}

export type NumberExpression = ReturnType<typeof Number>
export type StringExpression = ReturnType<typeof String>
export type UnitExpression = ReturnType<typeof Unit>
export type ScalarExpression = ReturnType<typeof Scalar>
export type VectorExpression = ReturnType<typeof Vector>

export type Expression = 
    { type: string, cardinality: () => Cardinality } & (
    LiftExpression |
    YieldExpression |
    AssignmentExpression |
    NumberExpression |
    StringExpression |
    BlockExpression |
    UnitExpression |
    MergeExpression |
    ScalarExpression |
    VectorExpression
  )

export function Lift (expr: Expression): LiftExpression {
    return { 
      type: "Lift", 
      expr, 
      cardinality: () => Cardinality.Vector 
    } as const
}

export function Merge (lhs: Expression, rhs: Expression): MergeExpression {
    return {
      type: "Merge",
      lhs,
      rhs,
      cardinality: lhs.cardinality
    } as const
}

export const Number = (value: number) => ({ type: "Number", value, cardinality: () => Cardinality.Scalar } as const)
export const String = (str: string) => ({ type: "String", str, cardinality: () => Cardinality.Scalar } as const)
export const Unit = () => ({ type: "Unit", cardinality: () => Cardinality.Unit } as const)
export const Scalar = ( value ) => ({ type: "Scalar", value, cardinality: () => Cardinality.Scalar } as const)
export const Vector = ( value ) => ({ type: "Vector", value, cardinality: () => Cardinality.Vector } as const)
export function Assignment (key: string, expr: Expression): AssignmentExpression {
    return { 
      type: "Assignment", 
      key, 
      expr,
      cardinality: expr.cardinality
     } as const
}

export function Yield(inner: Expression): YieldExpression {
    return { type: "Yield", inner, cardinality: () => Cardinality.Scalar } as const
}

export const Block = () => new BlockExpression()

export class BlockExpression {
  readonly type = "Block"
  readonly sections: Expression[][] = []

  startSection() {
    this.sections.push([])
  }

  pushExr(expr: Expression) {
    if (this.sections.length === 0) {
      this.startSection()
    }
    this.sections[this.sections.length - 1].push(expr)
  }

  cardinality() {
    if (this.sections.length === 0)
      return Cardinality.Unit    
    if (this.sections.length > 1)
      return Cardinality.Vector
    
    const section = this.sections[0]
    const yieldCount = section.filter(e => e.type === "Yield").length
    if (yieldCount <= 1)
      return Cardinality.Scalar
    return Cardinality.Vector
  }
  
  toString() {
    const header = `Block: \n${this.cardinality()}`

    return this.sections.reduce((acc, section) => {
      const exprs = section.map(e => e.type).join("\n")
      return acc + "\n---\n" + exprs

    }, header)
  }
}


export function BuildAst(tokens: Stream<l.Token>): BlockExpression {
  tokens.consumeWhile(tkn => tkn.type === "Newline")
  return parseBlock(tokens)
}

function parseBlock(tkns: Stream<l.Token>): BlockExpression {
  let indent = 0

  // We need to look ahead to see if there is any explicit section

  const lookAhead = tkns.range()
  sectionStartLoop: for (let token = lookAhead.peek(); token; token = lookAhead.next()) { 
    switch (token.type) {
      case "Indent":
        indent++
        break
      case "Outdent":
        indent--
        if (indent < 0) {
          break sectionStartLoop
        }
        break
      case "SectionStart":
        if (indent === 0) {
          tkns.consume(lookAhead.position)
          break sectionStartLoop
        }
    }
  }
  const block = new BlockExpression()

  while (tkns.hasMore) {
    const token = tkns.next()
    switch (token.type) {
      case "Newline":
        continue
      case "SectionStart": {
        block.startSection()
        continue
      }
      case "Indent": {
        const ptr = tkns.position
        block.pushExr(parseBlock(tkns))
        continue
      }
      case "Outdent": {
        return block
      }
      case "Atom": {
        const nextToken = tkns.peek()
        
        if (nextToken && nextToken.type === "LiteralAssignment") {
          tkns.next() // consume LiteralAssignment
          block.pushExr(Assignment(token.str, Scalar(nextToken.str)))
          continue
        }

        if (nextToken && nextToken.type === "ExpressionAssignment") {
          tkns.backtrack()
          block.pushExr(parseAssignment(tkns))
          continue
        }

        break
      }
      default:
        throw new Error(`Unexpected token type in block: ${token.type}`)
    }
  }

  return block
}

function parseAssignment(tkns: Stream<l.Token>): Expression {
  const keyToken = tkns.next()
  if (keyToken.type !== "Atom") {
    throw new Error("Expected Atom token for assignment key")
  }

  if (tkns.next().type !== "ExpressionAssignment") {
    throw new Error("Expected Assignment token")
  }

  let valueToken = tkns.next()
  switch (valueToken.type) {
    case "LiteralAssignment": {
      tkns.next() // consume Newline
      return Assignment(keyToken.str, String(valueToken.str))
    }

    case "Indent": {
      const ptr = tkns.position
      // tkns.consume(1) // consume Indent
      const blockExpr = parseBlock(tkns)
      return Assignment(keyToken.str, blockExpr)
    }

    case "EmptyObject": {
      return Assignment(keyToken.str, Scalar({}))
    }

    case "EmptyList": {
      return Assignment(keyToken.str, Vector([]))
    }

    default: {
      const values = tkns.consumeWhile(tkn => tkn.type !== "Newline")

      const str = values.reduce((acc, token, i) => {
        if (token.type === "Atom") {
            return acc + token.str + (i == values.length - 1 ? '' : token.trailingWs)
          }
          return acc

      }, '')
     
      tkns.next() // consume Newline
      return Assignment(keyToken.str, String(str))
    }    
  }
  throw new Error("Unrecognized token in assignment value")
}