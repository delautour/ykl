
import { Cardinality } from './type_system.ts'

interface BaseExpression {
  readonly type: string
  readonly cardinality: () => Cardinality
}

interface TerminalExpression extends BaseExpression { }

interface UnaryExpression extends BaseExpression {
  operand: Expression
}

interface BinaryExpression extends BaseExpression {
  lhs: Expression
  rhs: Expression
}

export interface UnitExpression extends TerminalExpression {
  readonly type: "Unit"
}

export interface ScalarExpression extends TerminalExpression {
  readonly type: "Scalar"
  readonly value: any
}

export interface VectorExpression extends TerminalExpression {
  readonly type: "Vector"
  readonly value: any
}

export class AssignmentExpression implements UnaryExpression {
  public readonly type = "Assignment"
  readonly key: string

  private _operand: Expression
  constructor(key: string, operand?: Expression) {
    this.key = key
    this._operand = operand
  }

  public get operand() {
    return this._operand
  }

  public setOperand(operand: Expression) {
    this._operand = operand
  }

  public get cardinality() {
    return this.operand.cardinality()
  }
}

export class FunctionExpression implements UnaryExpression {
  cardinality = () => Cardinality.Unknown
  readonly type = "Function"
  readonly identifier: string
  operand: Expression

  constructor(identifier: string, operand?: Expression) {
    this.identifier = identifier
    this.operand = operand
  }
}

export interface LiftExpression extends UnaryExpression {
  readonly type: "Lift"
}

export interface MergeExpression extends BinaryExpression {
  readonly type: "Merge"
  readonly mergeType: "Hard" | "Soft"
}

export interface YieldExpression extends UnaryExpression {
  readonly type: "Yield"
}

export interface ApplicationExpression extends UnaryExpression {
  readonly type: "Application"
  readonly identifier: string
}

export interface PipelineExpression extends BinaryExpression {
  readonly type: "Pipeline"
}

export class BlockExpression implements BaseExpression {
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

export type Expression =
  LiftExpression |
  YieldExpression |
  AssignmentExpression |
  BlockExpression |
  UnitExpression |
  MergeExpression |
  ScalarExpression |
  ApplicationExpression |
  PipelineExpression |
  VectorExpression | 
  FunctionExpression

export const Block = () => new BlockExpression()

export function Unit(): UnitExpression {
  return { type: "Unit", cardinality: () => Cardinality.Unit } as const
}

export function Scalar(value: any): ScalarExpression {
  return { type: "Scalar", value, cardinality: () => Cardinality.Scalar } as const
}

export function Vector(value: any): VectorExpression {
  return { type: "Vector", value, cardinality: () => Cardinality.Vector } as const
}

function Application(identifier: string, operand?: Expression): ApplicationExpression {
  return {
    type: "Application",
    operand,
    identifier,
    cardinality:
      () => Cardinality.Unknown
  } as const
}


export function Lift(expr: Expression): LiftExpression {
  return {
    type: "Lift",
    operand: expr,
    cardinality: () => Cardinality.Vector
  } as const
}

export function Merge(lhs: Expression, rhs: Expression, mergeType: "Hard" | "Soft" = "Hard"): Expression {
  const lhsCard = lhs.cardinality()
  const rhsCard = rhs.cardinality()
  if (rhsCard === "Unit") {
    return lhs
  }

  if (lhsCard === "Unit") {
    return rhs
  }

  if (lhsCard === "Scalar" && rhsCard === "Vector") {
    throw new Error("Merging of Vector into Scalar is not supported")
  }

  const merge: MergeExpression = {
    type: "Merge",
    lhs,
    rhs,
    mergeType,
    cardinality: lhs.cardinality
  }

  return merge
}

export function Assignment(key: string, expr?: Expression): AssignmentExpression {
  return new AssignmentExpression(key, expr)
}

export function Yield(operand: Expression): YieldExpression {
  return { type: "Yield", operand, cardinality: () => Cardinality.Scalar } as const
}

/// ----------------------------------------------------------------
/// Parser
/// --------------------------------------------------------------------------

import * as l from './lexer.ts'
import { Stream } from './stream.ts'

export function BuildAst(tokens: Stream<l.Token>): BlockExpression {
  parseBlock(tokens)
  const block = STACK.pop()
  if (STACK.length !== 0) {
    throw new Error("Stack is not empty after parsing block")
  }
  if (block.type !== "Block") {
    throw new Error("Top of stack is not a Block expression")
  }
  return block
}

const STACK: Expression[] = []

function parseBlock(tkns: Stream<l.Token>): BlockExpression {
  const block = new BlockExpression()
  STACK.push(block)

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
        parseBlock(tkns)
        block.pushExr(STACK.pop())
        continue
      }
      case "EOF":
      case "Outdent": {
        return block
      }
      case "Symbol": {
        const nextToken = tkns.peek()

        if (!nextToken) {
          throw new Error("Unexpected end of tokens after Atom")
        }

        if (token.str === "yield") {
          if (nextToken.type === "Symbol") {
            parseApplication(tkns)
            block.pushExr(Yield(STACK.pop()))
            continue
          }
          if (nextToken.type === "Indent") {
            tkns.next() // consume Indent
            parseBlock(tkns)
            block.pushExr(Yield(STACK.pop()))
            continue
          }

          throw new Error("Yield must be used as 'yield <expression>'")
        }

        if (nextToken.type === "Assignment") {
          tkns.next() // consume Assignment
          const assignment= Assignment(token.str)
          
          STACK.push(assignment)
          expressionChain(tkns)
          assignment.setOperand(STACK.pop())
          
          block.pushExr(STACK.pop())
          continue
        }

        tkns.backtrack()
        parseApplication(tkns)
        block.pushExr(STACK.pop())

        break
      }
      default:
        throw new Error(`Unexpected token type in block: ${token.type}`)
    }
  }

  throw new Error("Expected Outdent")
}

function parseApplication(tkns: Stream<l.Token>) {
  const atom = tkns.next()
  if (atom.type !== "Symbol") {
    throw new Error("Expected Atom token at start of application")
  }

  const next = tkns.peek()

  if (next.type === "Symbol") {
    const application = Application(atom.str)
    STACK.push(application)
    parseApplication(tkns)
    if (STACK[STACK.length - 1].type !== "Function") {
      const operand = STACK.pop()
      application.operand = operand
    }
    return
  }

  STACK.push(Application(atom.str))

  expressionChain(tkns)

}

function parseOperator(tkns: Stream<l.Token>): boolean {
  const operatorToken = tkns.peek()
  switch (operatorToken.type) {
    case "Pipeline": {
      const lhs = unwindUntil("Block", "Assignment")

      return true
    }

  }

  return false
}

function expressionChain(tkns: Stream<l.Token>) {
 const tkn = tkns.peek()
 const ptr = tkns.position

  switch (tkn.type) {
    case "Outdent":
    case "EOF":
    case "Newline":
    {
      return false
    }
    case "EmptyObject": {
      tkns.consume()
      STACK.push(Scalar({}))
      return true
    }
    case "EmptyList": {
      tkns.consume()
      STACK.push(Vector([]))
      return true
    }
    case "String": {
      tkns.consume()
      STACK.push(Scalar(tkn.str))
      return true
    }
    case "Number": {
      tkns.consume()
      STACK.push(Scalar(tkn.num))
      return true
    }
    case "Indent": {
      tkns.consume()
      parseBlock(tkns)
      return true
    }
    case "Symbol": {
      parseApplication(tkns)
      return true
    }
    case "Fn" : {
      tkns.consume() // consume operator
      parseFunctionDefinition(tkns)
      return true
    }
    case "SoftMerge":
    case "HardMerge": {
      tkns.consume() // consume operator
      const LHS = STACK.pop()      
      expressionChain(tkns)
      const RHS = STACK.pop()
      STACK.push(Merge(LHS, RHS, tkn.type === "HardMerge" ? "Hard" : "Soft"))
      return true
    }

    default: {
      throw new Error(`Unexpected token type in expression chain: ${tkn.type}`)
    }
  }
}

function parseFunctionDefinition(tkns: Stream<l.Token>) {
  const ids = unwindWhile("Application")

  if (ids.length === 0) {
    warn("Function has no arguments")
  }

  expressionChain(tkns)

  for (const id of ids) {
    const rhs = STACK.pop()
    STACK.push(new FunctionExpression(id.identifier, rhs)) 
  }
}

function unwindUntil(...types: Expression["type"][]) {
  const peek = () => STACK[STACK.length - 1]
  const result: Expression[] = []
  let top = peek()

  while (types.indexOf(peek().type) < 0) {
    top = STACK.pop()
    result.push(top)
  }

  return result
}

function unwindWhile<T extends Expression["type"], U extends Extract<Expression, { type: T }>>(...types: T[]): U[] {
  const peek = () => STACK[STACK.length - 1]
  const result: U[] = []

  while (STACK.length > 0 && types.includes(peek().type as T)) {
    const popped = STACK.pop() as U
    result.push(popped)
  }

  return result
}


function warn(msg: string) {
  console.warn("Warning: " + msg)
}