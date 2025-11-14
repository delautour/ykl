
export const Cardinality = {
  Unit: "Unit",
  Scalar: "Scalar",
  Vector: "Vector"
}

export type Cardinality = typeof Cardinality[keyof typeof Cardinality]
   
