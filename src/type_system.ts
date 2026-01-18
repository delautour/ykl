export const Cardinality = {
  Unit: "Unit",
  Scalar: "Scalar",
  Vector: "Vector",
  Unknown: "Unknown"
}

export type Cardinality = typeof Cardinality[keyof typeof Cardinality]

export class BaseType {
  readonly type: string
  readonly cardinality: Cardinality

  assignableTo(other: BaseType): boolean {
    return other.type === this.type
  }

  assignableFrom(other: BaseType): boolean {
    return other.assignableTo(this)
  }

  toString(): string {
    return `${this.type}`
  }
}

export class UnitType extends BaseType {
  readonly type = "Unit"
  readonly cardinality = "Unit"

  assignableTo(other: BaseType): boolean {
    return other.type === "Unit"
  }
}

export const Unit = new UnitType()

class UnresolvedType extends BaseType {
  readonly type = "Unresolved"
  readonly cardinality = "Unknown"
}

export const Unresolved = new UnresolvedType()


export class AnyType extends BaseType {
  readonly type = "Any"
  readonly cardinality = "Unknown"
}

export const Any = new AnyType()

export class StructType extends BaseType {
  readonly type = "Struct"
  readonly fields: Map<string, Set<Type>> = new Map()
  cardinality = "Scalar"

  addField(name: string, type: Type) {
    if (!this.fields.has(name)) {
      this.fields.set(name, new Set())
    }
    this.fields.get(name)!.add(type)
  }

  equals(other: StructType): boolean {
    if (this.fields.size !== other.fields.size) {
      return false
    }
    for (const [key, types] of this.fields) {
      const otherTypes = other.fields.get(key)
    }
  }

  assignableTo(other: BaseType): boolean {
    if (other.type !== "Struct") {
      return false
    }
    throw new Error("Method not implemented.")
  }

  toString(): string {
    const fieldStrs: string[] = []
    for (const [fieldName, types] of this.fields) {
      const typeStrs = Array.from(types).map(t => t.toString()).join(" | ")
      fieldStrs.push(`${fieldName}: <${typeStrs}>`)
    }
    return `${fieldStrs.join(", ")}`
  }
}

export class VectorType extends BaseType {
  readonly type = "Vector"
  readonly elementTypes: Set<Type> = new Set()
  readonly cardinality = "Vector"

  constructor(elementTypes: Type[] = []) {
    super()
    for (const et of elementTypes) {
      this.elementTypes.add(et)
    }
  }

  addElementType(type: Type) {
    this.elementTypes.add(type)
    return this
  }

  assignableTo(other: BaseType): boolean {
    if (other.type !== "Vector") {
      return false
    }
    throw new Error("Method not implemented.")
  }

  toString(): string {
    const typeStrs = Array.from(this.elementTypes).map(t => t.toString())
    return `Vector<${typeStrs.join(" | ")}>`
  }
}

export class StringType extends BaseType {
  readonly type = "String"
  cardinality = "Scalar"
  pattern?: RegExp

  constructor(pattern?: RegExp | string) {
    super()
    if (typeof pattern === "string") {
      this.pattern = new RegExp(pattern)
    }else {
      this.pattern = pattern
    }
  }
}

export class NumberType extends BaseType {
  readonly type = "Number"
  readonly cardinality = "Scalar"
  readonly min: number
  readonly max: number
  constructor(min?: number, max?: number) {
    super()
    this.min = min
    this.max = max
  }
}

export class BooleanType extends BaseType {
  readonly type = "Boolean"
  cardinality = "Scalar"
}

export class KubenetesResourceType extends StructType {
  constructor()
  constructor(apiVersion: string, kind: string)
  constructor(apiVersion?: string, kind?: string)
   {
    super()
    this.fields.set("apiVersion", new Set([new StringType(apiVersion)]))
    this.fields.set("kind", new Set([new StringType(kind)]))
  }
}

export class Union extends BaseType {
  readonly type = "Union"
  readonly types: Set<Type> = new Set()
  readonly cardinality = "Unknown"

  toString(): string {
    const typeStrs = Array.from(this.types).map(t => t.toString())
    return `<Union ${typeStrs.join(" | ")}>`
  }
}

export type Type =
  | UnitType
  | StructType
  | VectorType
  | StringType
  | NumberType
  | BooleanType
  | UnresolvedType
  | AnyType
  | KubenetesResourceType
  | Union

export function toString(type: Type, indent: number = 0): string {
  const indentStr = " ".repeat(indent)

  switch (type.type) {
    case "Struct":
      const structType = type as StructType
      if (structType.fields.size === 0) {
        return `{}`  
      }
      const fieldStrs: string[] = []
      for (const [fieldName, types] of structType.fields) {
        const typeStrs = Array.from(types).map(t => toString(t, indent + 2)).join(" | ")
        fieldStrs.push(`${indentStr}${fieldName}: ${typeStrs}`)
      }
      return `\n${fieldStrs.join("\n")}`   
    case "Vector":
      const vectorType = type as VectorType
      if (vectorType.elementTypes.size === 0) {
        return `Vector: []`  
      }
      const elemTypeStrs = Array.from(vectorType.elementTypes).map(t => toString(t, indent + 2))
      return `Vector: ${elemTypeStrs.join("\n" + indentStr + "  ---")}`
    case "String":
      return type.pattern ? `String<${type.pattern}>` : "String"
    case "Number":
      return `Number<${type.min}:${type.max}>`
    case "Boolean":
    default:
      return type.type
  }
}