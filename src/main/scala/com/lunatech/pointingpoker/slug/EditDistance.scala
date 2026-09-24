package com.lunatech.pointingpoker.slug

import org.apache.commons.text.similarity.DamerauLevenshteinDistance

// Damerau-Levenshtein: an insertion, deletion, substitution or transposition is one edit.
object EditDistance:

  private val distance = new DamerauLevenshteinDistance()

  def apply(a: String, b: String): Int = distance.apply(a, b)
end EditDistance
