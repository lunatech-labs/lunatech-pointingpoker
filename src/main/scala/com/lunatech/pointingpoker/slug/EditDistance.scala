package com.lunatech.pointingpoker.slug

// Optimal string alignment: an insertion, deletion, substitution or adjacent swap is one edit.
object EditDistance:

  def apply(a: String, b: String): Int =
    val d = Array.tabulate(a.length + 1, b.length + 1)((i, j) =>
      if i == 0 then j else if j == 0 then i else 0
    )
    for i <- 1 to a.length; j <- 1 to b.length do
      val cost = if a(i - 1) == b(j - 1) then 0 else 1
      d(i)(j) = math.min(math.min(d(i - 1)(j) + 1, d(i)(j - 1) + 1), d(i - 1)(j - 1) + cost)
      if i > 1 && j > 1 && a(i - 1) == b(j - 2) && a(i - 2) == b(j - 1) then
        d(i)(j) = math.min(d(i)(j), d(i - 2)(j - 2) + 1)
    d(a.length)(b.length)
  end apply
end EditDistance
