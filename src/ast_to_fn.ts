import * as e from './expression.ts';

export default function astToFn(blk: e.Expression) {
    return (values: Object) => {
        const ctx =  {values}
        return expressionToFn(blk)(ctx)
    }
}

function expressionToFn(expr: e.Expression): Generator {
    switch (expr.type) {
        case "Block":
            return blockToFn(expr)
        case "Assignment":
            throw new Error("Assignments are not directly executable")
        case "String":
            return () => expr.str
        case "Number":
            return () => expr.value
        case "Unit":
            return () => undefined
        case "Scalar":
            return () => expr.value
        case "Vector":
            return () => expr.value
        case "Yield":
            return expressionToFn(expr.inner)
        case "Lift":
            return liftToFn(expr)
        case "Merge":
            return mergeToFn(expr)

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
        
        for (const expr of assignments) {
            assignmentsObj[expr.key] = expressionToFn(expr.expr)(ctx)
        }

        const explicit = yields.map(fn => fn(ctx))
        if (explicit.length > 0) 
            return explicit
        
        if (lastExpr.type !== "Assignment") 
            return expressionToFn(lastExpr)(ctx)

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
            if (expr.rhs.cardinality() === "Vector") {
                throw new Error("Cannot merge Vector into Scalar")
            }
            throw new Error("Not implemented: merging two Scalars")
        }
    }
}



const EMPTY = Symbol("empty")
type Literal = Object | Object[] | string | number | typeof EMPTY
type Generator = (ctx: Context) => Literal;

interface Context {
    values: Object;
}

function assertUnreachable(_: never): never {
    throw new Error("Didn't expect to get here");
}

function liftToFn(expr: e.LiftExpression): Generator {
    return (ctx: Context) => {
        const inner = expressionToFn(expr.expr)(ctx)
        if (Array.isArray(inner)) {
            return inner
        }
        return [inner]
    }
    
}
