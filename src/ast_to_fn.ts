import { resolve } from 'path';
import * as e from './expression.ts';

export default function astToFn(blk: e.Expression) {
    return (values: Object) => {
        const ctx =  {values, identifiers: new Map<string, e.Expression>(), stack: []}
        return expressionToFn(blk)(ctx)
    }
}

const Unit = Symbol("unit")

function expressionToFn(expr: e.Expression): Generator {
    switch (expr.type) {
        case "Block":
            return blockToFn(expr)
        case "Assignment":
            throw new Error("Assignments are not directly executable")
        case "Unit":
            return () => Unit
        case "Scalar":
            return () => expr.value
        case "Vector":
            return () => expr.value
        case "Yield":
            return expressionToFn(expr.operand)
        case "Lift":
            return liftToFn(expr)
        case "Merge":
            return mergeToFn(expr)
        case "Application":
            return applicationToFn(expr)
        case "Function":
            return functionToFn(expr)
        case "Pipeline":
            throw new Error("Pipelines are not yet supported")

        default: 
            return assertUnreachable(expr)   
    }
}

function blockToFn(block: e.BlockExpression): Generator {
    const sectionsFns = block.sections.map(sectionToFn)

    if (sectionsFns.length === 1) {
        return sectionsFns[0]
    }

    return (ctx: Context) => {
        const results: Literal[] = []
        for (const sectionFn of sectionsFns) {
            results.push(sectionFn(ctx))
        }
        return results
    }
}

function sectionToFn(section: e.Expression[]): Generator {
    if (section.length === 0) {
        throw new Error("Empty sections are not supported");
    }

    const yields = section.filter(expr => expr.type === "Yield").map(expressionToFn)
    const assignments = section.filter(expr => expr.type === "Assignment")
    const lastExpr = section[section.length - 1]
    
    return (ctx: Context) => {      
        const assignmentsObj: Object = {}
        const thisCtx = cloneContext(ctx)
        
        for (const expr of assignments) {
            thisCtx.identifiers.set(expr.key, expr.operand)
            if (expr.operand.type !== "Function") {
                assignmentsObj[expr.key] = expressionToFn(expr.operand)(thisCtx)
            }
        }

        const explicit = yields.map(fn => fn(thisCtx))
        if (explicit.length > 0) 
            return explicit
        
        if (lastExpr.type !== "Assignment") 
            return expressionToFn(lastExpr)(thisCtx)
        return assignmentsObj
    }
}

function mergeToFn(expr: e.MergeExpression): Generator {
    const lhsFn = expressionToFn(expr.lhs)
    const rhsFn = expressionToFn(expr.rhs)
    return (ctx: Context) => {
        const lhs = lhsFn(ctx)
        const rhs = rhsFn(ctx)

        if (expr.lhs.cardinality() === "Vector") {
            if (!Array.isArray(lhs)) {
                throw new Error("LHS of Merge expected to be an array")
            }
            if (!Array.isArray(rhs)) {
                return [...lhs, rhs]
            }
            return [...lhs, ...rhs]
        } else {
            return deepMerge(lhs, rhs)
         
        }
    }
}

function deepMerge(lhs: Object, rhs: Object): Object {
    if (lhs === undefined) {
        return rhs
    }
    if (rhs === undefined) {
        return lhs
    }
    const result: Object = {...lhs}
    
    for (const [key, rhsValue] of Object.entries(rhs)) {
        const lhsValue = lhs[key]

        if(typeof rhsValue === 'object') {
            
            if (lhsValue === undefined) {
                result[key] = rhsValue
            }
            else if (typeof lhsValue === 'object') {
                result[key] = deepMerge(lhsValue as Object, rhsValue as Object)
            }
            else {
                throw new Error(`Cannot merge object into non-object value at key ${key}`)
            }
        }

        else if (Array.isArray(rhsValue)) {
            if (lhsValue === undefined) {
                result[key] = rhsValue
            }
            else if (Array.isArray(lhsValue)) {
                result[key] = [...(lhsValue as Object[]), ...(rhsValue as Object[])]
            }
            else {
                throw new Error(`Cannot merge array into non-array value at key ${key}`)
            }
        }

        else {
            result[key] = rhsValue
        }

    }

    return result
}

const EMPTY = Symbol("empty")
type Literal = Object | Object[] | string | number | typeof EMPTY
type Generator = (ctx: Context) => Literal;

interface Context {
    values: Object;
    identifiers: Map<string, e.Expression>;
    stack: any[];
}

function assertUnreachable(expr: never): never {
    throw new Error("Didn't expect to get here");
}

function liftToFn(expr: e.LiftExpression): Generator {
    return (ctx: Context) => {
        const inner = expressionToFn(expr.operand)(ctx)
        if (Array.isArray(inner)) {
            return inner
        }
        return [inner]
    }
}

function applicationToFn(expr: e.ApplicationExpression): Generator {    
    const id = expr.identifier
    
    let value : undefined | number | string  = undefined
    if (/[\d+(.\d+)]/.test(id)) {
        value = Number(id)      
    }
    if (id.startsWith('"') && id.endsWith('"')) {
        value = id.slice(1, -1)
    }

    return (ctx: Context) => {
        if (expr.operand) {
            expressionToFn(expr.operand)(ctx)
        }

        if (value !== undefined) {
            return ctx.stack.push(value)
        }

        const resolvedExpr = ctx.identifiers.get(expr.identifier)

        if (!resolvedExpr) {
            throw new Error(`Identifier ${expr.identifier} not found in context`)
        }
        
        const r = expressionToFn(resolvedExpr)(ctx)     
        ctx.stack.push(r)

        return r
    }
}


function functionToFn(expr: e.FunctionExpression): Generator {
    const operandFn = expressionToFn(expr.operand)
    return (ctx: Context) => {
        const arg = ctx.stack.pop()

        const fnCtx = cloneContext(ctx)
        fnCtx.identifiers.set(expr.identifier, e.Scalar(arg))

        const result = operandFn(fnCtx)
        ctx.stack.push(result)
        return result
    }
}

function cloneContext(ctx: Context): Context {
    return {
        values: ctx.values,
        stack: ctx.stack.slice(),
        identifiers: new Map(ctx.identifiers),
    }
}