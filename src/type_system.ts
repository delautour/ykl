
export const Cardinality = {
  Unit: "Unit",
  Scalar: "Scalar",
  Vector: "Vector",
  Unknown: "Unknown"
}

export type Cardinality = typeof Cardinality[keyof typeof Cardinality]
   
