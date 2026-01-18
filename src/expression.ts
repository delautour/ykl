
import { BooleanType, Cardinality, NumberType, StringType, UnitType, type Type, Unit as UnitTypeInstance, Unresolved, Any, StructType, type AnyType, VectorType } from './type_system.ts'

import { Map, Stack } from 'immutable'

interface BaseExpression {
  readonly type: string
  readonly cardinality: () => Cardinality
  typeConstraint: Type | undefined
  dataType: Type | undefined
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
  readonly inner: Expression[]
}

export class ScopedExpression implements UnaryExpression {
  operand: Expression
  public readonly type = "Scope"
  readonly symbolTable: Map<string, Expression>
  typeConstraint: Type | undefined
  dataType: Type | undefined
  parent: ScopedExpression

  constructor(table: Map<string, Expression>, parent?: ScopedExpression, operand?: Expression) {
    this.symbolTable = table
    this.parent = parent
    this.operand = operand
  }

  cardinality() {
    return this.operand.cardinality()
  }

  resolve(name: string): Expression | undefined {
    if (this.symbolTable.has(name)) {
      return this.symbolTable.get(name)
    }
    if (this.parent) {
      return this.parent.resolve(name)
    }
    return undefined
  }

  toObject() {
    return {...this.parent?.toObject() || {}, ...this.symbolTable.toObject()}
  }
}

export class AssignmentExpression implements UnaryExpression {
  public readonly type = "Assignment"
  readonly key: string
  typeConstraint: Type | undefined
  dataType: Type | undefined

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

export class FunctionDefinitionExpression implements BaseExpression {
  cardinality = () => Cardinality.Unknown
  readonly type = "Function"
  readonly identifier: string
  typeConstraint: Type | undefined
  dataType: Type | undefined
  body: Expression

  constructor(identifier: string, body?: Expression) {
    this.identifier = identifier
    this.body = body
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

export class PipelineExpression implements BaseExpression {
  cardinality: () => Cardinality
  typeConstraint: Type
  dataType: Type
  readonly type = "Pipeline"
}

export class BlockExpression implements BaseExpression {
  readonly type = "Block"
  readonly sections: Expression[][] = []
  typeConstraint: Type | undefined
  dataType: Type | undefined

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

    if (this.isStruct()) {
      return Cardinality.Scalar
    } 

    return Cardinality.Vector
  }

  isStruct() {
    if (this.sections.length !== 1) {
      return false
    }
    const section = this.sections[0]
    return section.every(e => e.type === "Assignment")
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
  FunctionDefinitionExpression |
  ScopedExpression

export const Block = () => new BlockExpression()

export function Unit(): UnitExpression {
  return { 
    type: "Unit", 
    cardinality: () => Cardinality.Unit, 
    typeConstraint: undefined,
    dataType: UnitTypeInstance
    } as const
}

export function Scalar(value: any, dataType: StringType | BooleanType | NumberType | UnitType | StructType | AnyType): ScalarExpression {
  return { 
    type: "Scalar", 
    value, cardinality:
     () => Cardinality.Scalar, 
     typeConstraint: undefined, 
     dataType
    } as const
}

export function Vector(inner: Expression[]): VectorExpression {
  return { 
    type: "Vector", 
    inner,
    cardinality: () => Cardinality.Vector, 
    typeConstraint: undefined, 
    dataType: undefined
  } as const
}

function Application(identifier: string, operand?: Expression): ApplicationExpression {
  return {
    type: "Application",
    operand,
    identifier,
    cardinality:      () => Cardinality.Unknown,
    typeConstraint: undefined,
    dataType: undefined
  } as const
}

export function Lift(expr: Expression): LiftExpression {
  return {
    type: "Lift",
    operand: expr,
    cardinality: () => Cardinality.Vector,
    typeConstraint: undefined,
    dataType: undefined
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
    cardinality: lhs.cardinality,
    typeConstraint: lhs.typeConstraint,
    dataType: lhs.dataType
  }

  return merge
}

export function Assignment(key: string, expr?: Expression): AssignmentExpression {
  return new AssignmentExpression(key, expr)
}

export function Yield(operand: Expression): YieldExpression {
  return { 
    type: "Yield", 
    operand, cardinality: () => Cardinality.Scalar, 
    typeConstraint: undefined,
    dataType: undefined
    } as const
}

/// ----------------------------------------------------------------
/// Parser
/// --------------------------------------------------------------------------

import * as l from './lexer.ts'
import { Stream } from './stream.ts'

export function BuildAst(tokens: Stream<l.Token>): Expression {
  const scope = new ScopedExpression(Map(), undefined, Unit())
  STACK.push(scope)
  parseBlock(tokens)
  const block = STACK.pop()
  if (STACK.length !== 1) {
    throw new Error("Stack is not empty after parsing block")
  }
  if (block.type !== "Block") {
    throw new Error("Top of stack is not a Block expression")
  } 
  scope.operand = block
  return STACK.pop()
}

type StackFrame = Expression & { }
const STACK: StackFrame[] = []
const SCOPE_STACK: Map<string, Expression>[] = []

function parseBlock(tkns: Stream<l.Token>): BlockExpression {
  const block = new BlockExpression()
  STACK.push(block)

  let currentSectionSymbolTable = Map<string, Expression>()
  let frontMatterSymbolTable: Map<string, Expression> = Map<string, Expression>()

  let sections: Expression[][] = [[]] 

  while (tkns.hasMore) {
    const token = tkns.next()
    switch (token.type) {
      case "Newline":
        continue
      case "SectionStart": {
        frontMatterSymbolTable ||= currentSectionSymbolTable
        currentSectionSymbolTable = frontMatterSymbolTable
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
        const scope = new ScopedExpression(currentSectionSymbolTable, STACK.findLast(e => e.type === "Scope") as ScopedExpression)
        STACK.push(scope)

        if (!nextToken) {
          throw new Error("Unexpected end of tokens after Atom")
        }

        if (token.str === "yield") {
          
          if (nextToken.type === "Symbol") {
            parseApplication(tkns)
            scope.operand = STACK.pop()

            block.pushExr(Yield(STACK.pop()))
            continue
          }
          if (nextToken.type === "Indent") {
            tkns.next() // consume Indent
            parseBlock(tkns)
            scope.operand = STACK.pop()
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
          const operand = STACK.pop()
          assignment.setOperand(operand)
          scope.operand = STACK.pop()
          
          currentSectionSymbolTable = currentSectionSymbolTable.set(assignment.key, scope)
          
          block.pushExr(STACK.pop())
          continue
        }

        tkns.backtrack()
        parseApplication(tkns)
        STACK.pop()
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
    if (STACK.at(-1).type !== "Function") {
      const operand = STACK.pop()
      application.operand = operand
    }
    return
  }
  const scope = STACK.findLast(x => x.type === "Scope")
  const resolved = scope.resolve(atom.str)
  if (!resolved) {
    STACK.push(Application(atom.str))
  }else{
    STACK.push(resolved)
    if (resolved.type === "Function") {
      inlineFunction()
    }
  }
  // STACK.push(Application(atom.str))
  expressionChain(tkns)
}

function inlineFunction() {

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
      STACK.push(Scalar({}, new UnitType()))
      return true
    }
    case "EmptyList": {
      tkns.consume()
      STACK.push(Vector([]))
      return true
    }
    case "String": {
      tkns.consume()
      STACK.push(Scalar(tkn.str, new StringType(tkn.str)))
      return true
    }
    case "Number": {
      tkns.consume()
      STACK.push(Scalar(tkn.num, new NumberType(tkn.num, tkn.num)))
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
    case "Pipeline":
    {
      tkns.consume() // consume operator
      const pipeline = new PipelineExpression()  
      STACK.push(pipeline)
      expressionChain(tkns)
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
    STACK.push(new FunctionDefinitionExpression(id.identifier, rhs)) 
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


function reduceAst(expr: Expression): Expression {
  switch (expr.type) {
    case "Merge": {
      const left = reduceAst(expr.lhs)
      const right = reduceAst(expr.rhs)

      return merge(left, right)
    }

    case "Block": {
      if (expr.sections.length === 0) {
        return Unit()
      }

      if (expr.sections.length === 1 && expr.sections[0].length === 0) {
        return Unit()
      }

      let frontmatter = Map<string, Expression>()
      for (let i = 0; i < expr.sections.length; i++) {
        const section = expr.sections[i]
        let symbolTable = Map<string, Expression>()



        if (i === 0){
          frontmatter = symbolTable
        }
      }
      return expr
    }

    case "Lift": {
      const inner = reduceAst(expr.operand)
      if (inner.type === "Vector") {
        return inner
      }
      return Vector([inner])
    }
  }
  return expr
}

function warn(msg: string) {
  console.warn("Warning: " + msg)
}


// type expression - for every value of 'type' in Expression, map to a function that takes that expression type
type Visitor<T> = {
  [K in Expression["type"] as K extends string ? Lowercase<K> : never]: (expr: Extract<Expression, { type: K }>) => T
}


export function getDataType(symbolTable: SymbolTable, expr: Expression): Type {
  switch (expr.type) {
    case "Unit":
      return UnitTypeInstance
    case "Scalar":
      return expr.dataType!
    case "Vector":
      const types = expr.inner.map(e => getDataType(symbolTable, e))
      return new VectorType(types)
    case "Application":
      if (check(symbolTable, expr.identifier)) {
        const resolved = symbolTable.get(expr.identifier)
        return getDataType(symbolTable, resolved)
      }
      return Unresolved
    case "Function":
      return Any
    case "Lift":
      const innerType = getDataType(symbolTable, expr.operand)
      if (innerType instanceof VectorType) {
        return innerType
      }
      return new VectorType([innerType])
    case "Function":
      return Any
    case "Merge":
      const lhs = getDataType(symbolTable, expr.lhs)
      const rhs = getDataType(symbolTable, expr.rhs)

      if (lhs instanceof VectorType && rhs instanceof VectorType) {
        return new VectorType([...lhs.elementTypes, ...rhs.elementTypes])
      }
      return lhs
    case "Yield":
      return getDataType(symbolTable, expr.operand)
    case "Block":
      if (expr.sections.length === 0) return UnitTypeInstance

      if (expr.sections.length === 1) {
        return getSectionType(symbolTable, expr.sections[0])
      }

      const table = expr.sections[0].reduce((table, e) => {
        if (e.type === "Assignment") {
         return table.set(e.key, e.operand)
        }
        return table
      }, symbolTable)

      const sectionTypes = expr.sections.slice(1).map(section => getSectionType(table, section))

      return new VectorType(sectionTypes)
    case "Assignment":
      return getDataType(symbolTable, expr.operand)
    case "Pipeline":
      return Any
    case "Scope":
      return getDataType(expr.symbolTable, expr.operand)
    default:
      return assertUnreachable(expr)
  }
}

function getSectionType(table: SymbolTable, section: Expression[]): Type {
  if (section.length === 0) {
    return UnitTypeInstance
  }
  const struct = new StructType()
  const vector = new VectorType([])

  section.reduce(({ table, struct, vector }, expr) => {
    if (expr.type === "Assignment") {    
      const dataType = getDataType(table, expr.operand)
      struct.addField(expr.key, dataType)
      return { 
        table: table.set(expr.key, expr.operand),
        struct, vector 
      }
    }

    if (expr.type === "Yield") {
      const dataType = getDataType(table, expr.operand)
      vector.addElementType(dataType)
      return { table, struct, vector }
    }


    return { table, struct, vector }
  }, { table, struct, vector })

  if (vector.elementTypes.size > 0) {
    return vector
  }
  return struct

}


function assertUnreachable(expr: never): never {
    throw new Error("Didn't expect to get here");
}


type CheckedSymbol = string & { __checked: true };
type SymbolTable = Map<string, Expression>;

function check(table: SymbolTable, name: string): name is CheckedSymbol {
  return table.has(name)
}


type TypeError = string

export function* typeCheck(expr: Expression, type: Type): Generator<TypeError> {
  const simple = reduceAst(expr)
  switch (simple.type) {

  }
}

function merge(lhs: Expression, rhs: Expression): Expression {
  switch (lhs.type) {
    case "Unit": {
      return rhs
    }
    case "Vector": {
      if (rhs.type === "Vector") {
        return Vector([...lhs.inner, ...rhs.inner])
      }

      return Vector([...lhs.inner, rhs])
    }
    case "Block": {
      if (rhs.type === "Block") {
        
      }
    }
  }
  throw new Error("Merge not implemented for given types")
}
