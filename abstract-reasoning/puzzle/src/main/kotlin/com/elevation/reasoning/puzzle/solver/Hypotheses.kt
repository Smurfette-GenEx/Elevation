package com.elevation.reasoning.puzzle.solver

import com.elevation.reasoning.puzzle.solver.FeatureValue.Num
import com.elevation.reasoning.puzzle.solver.FeatureValue.SetOf
import kotlin.math.abs
import kotlin.math.roundToLong

/** A named candidate rule and the value it predicts for the unknown position. */
data class Hypothesis(val rule: String, val prediction: FeatureValue)

internal object Values {
    private const val EPS = 1e-6

    fun norm(v: Double, m: Double?): Double = if (m == null) v else ((v % m) + m) % m

    fun eq(a: FeatureValue?, b: FeatureValue?): Boolean {
        if (a == null || b == null) return a == b
        if (a is Num && b is Num) {
            if (a.modulus != b.modulus) return false
            val m = a.modulus
            val d = abs(norm(a.v, m) - norm(b.v, m))
            return d < EPS || (m != null && abs(d - m) < EPS)
        }
        return a == b
    }

    fun allEq(vs: List<FeatureValue?>) = vs.all { eq(it, vs.first()) }

    /** Wrapper so that "numeric without modulus" can be told apart from "not numeric". */
    data class Mod(val m: Double?)

    fun numericModulus(vs: List<FeatureValue?>): Mod? {
        if (vs.isEmpty() || vs.any { it !is Num }) return null
        val mods = vs.map { (it as Num).modulus }.distinct()
        return if (mods.size == 1) Mod(mods.single()) else null
    }

    fun diff(a: Double, b: Double, m: Double?) = norm(b - a, m)

    fun isZero(d: Double, m: Double?) = abs(d) < EPS || (m != null && abs(d - m) < EPS)

    fun numsEq(a: Double, b: Double, m: Double?): Boolean {
        val d = abs(norm(a, m) - norm(b, m))
        return d < EPS || (m != null && abs(d - m) < EPS)
    }

    fun clean(v: Double): Double = (v * 1e6).roundToLong() / 1e6
}

/** Hypotheses over a one-dimensional sequence of feature values. */
object SequenceHypotheses {

    fun predict(values: List<FeatureValue>, structural: Boolean = true): List<Hypothesis> {
        val n = values.size
        val out = mutableListOf<Hypothesis>()
        if (n >= 2 && Values.allEq(values)) out += Hypothesis("constant", values.first())
        if (structural) for (p in 2..(n - 2)) {
            if ((0 until n - p).all { Values.eq(values[it], values[it + p]) } && !Values.allEq(values)) {
                out += Hypothesis("repeats every $p", values[n - p])
            }
        }
        val mod = Values.numericModulus(values)
        if (mod != null) {
            val m = mod.m
            val v = values.map { (it as Num).v }
            fun mk(x: Double) = Num(Values.clean(Values.norm(x, m)), m)
            arithmetic(v, m)?.let { d -> if (!Values.isZero(d, m)) out += Hypothesis("steps of ${FeatureValue.fmt(d)}", mk(v.last() + d)) }
            // Accelerating change only makes sense on scales with room to grow (counts, angles, the ring).
            if (n >= 4 && (m == null || m >= 8)) {
                val d = (0 until n - 1).map { Values.diff(v[it], v[it + 1], m) }
                val dd = arithmetic(d, m)
                if (dd != null && !Values.isZero(dd, m)) out += Hypothesis("growing steps", mk(v.last() + d.last() + dd))
            }
            if (n >= 6) {
                val even = v.filterIndexed { i, _ -> i % 2 == 0 }
                val odd = v.filterIndexed { i, _ -> i % 2 == 1 }
                val de = arithmetic(even, m)
                val dOdd = arithmetic(odd, m)
                if (de != null && dOdd != null) {
                    val next = if (n % 2 == 0) even.last() + de else odd.last() + dOdd
                    out += Hypothesis("two interleaved progressions", mk(next))
                }
            }
            if (m == null && n >= 3 && v.all { it != 0.0 }) {
                val r = v[1] / v[0]
                if (abs(r - 1) > 1e-9 && (1 until n).all { abs(v[it] - v[it - 1] * r) < 1e-6 }) {
                    out += Hypothesis("multiplied by ${FeatureValue.fmt(r)}", mk(v.last() * r))
                }
            }
            if (m == null && n >= 5 && (2 until n).all { abs(v[it] - v[it - 1] - v[it - 2]) < 1e-6 }) {
                out += Hypothesis("sum of the previous two", mk(v[n - 1] + v[n - 2]))
            }
        }
        return out
    }

    /** Common difference of the list, or null when it is not arithmetic or too short to tell. */
    private fun arithmetic(v: List<Double>, m: Double?): Double? {
        if (v.size < 3) return null
        val d = Values.diff(v[0], v[1], m)
        return if ((1 until v.size - 1).all { Values.numsEq(Values.diff(v[it], v[it + 1], m), d, m) }) d else null
    }
}

/** Hypotheses over a grid of values with exactly one unknown cell. */
object MatrixHypotheses {

    fun predict(g: List<List<FeatureValue?>>, mr: Int, mc: Int, structural: Boolean = true): List<Hypothesis> {
        val rows = g.size
        val cols = g[0].size
        val out = mutableListOf<Hypothesis>()
        val known = g.flatten().filterNotNull()
        if (Values.allEq(known)) out += Hypothesis("same everywhere", known.first())

        val t = transpose(g)
        lineHypotheses(g, mr, mc, "row", structural).forEach { out += it }
        lineHypotheses(t, mc, mr, "column", structural).forEach { out += it }

        // Value in the missing column is a function of the value in another column (and vice versa).
        if (structural) {
            for (s in 0 until cols) if (s != mc) mapping(g, mr, mc, s)?.let { out += Hypothesis("column $s determines column $mc", it) }
            for (s in 0 until rows) if (s != mr) mapping(t, mc, mr, s)?.let { out += Hypothesis("row $s determines row $mr", it) }
        }
        return out
    }

    /**
     * Cross-feature hypotheses: in every complete row, the target feature in the missing column equals
     * another feature in another column (e.g. "dots on the right = sides of the shape on the left").
     */
    fun cross(
        target: List<List<FeatureValue?>>,
        source: List<List<FeatureValue?>>,
        sourceName: String,
        mr: Int,
        mc: Int,
    ): List<Hypothesis> {
        val out = mutableListOf<Hypothesis>()
        fun scan(tg: List<List<FeatureValue?>>, sg: List<List<FeatureValue?>>, r0: Int, c0: Int, line: String) {
            val lines = tg.indices.filter { it != r0 }
            for (s in sg[0].indices) {
                if (s == c0 && sg === source && tg === target) continue
                val src = lines.map { sg[it][s] }
                val dst = lines.map { tg[it][c0] }
                if (src.any { it !is Num } || dst.any { it !is Num } || lines.size < 2) continue
                if (Values.allEq(src)) continue
                if (lines.indices.all { Values.eq(src[it], dst[it]) }) {
                    val pred = sg[r0][s] ?: continue
                    out += Hypothesis("matches $sourceName in $line position $s", pred)
                }
            }
        }
        scan(target, source, mr, mc, "column")
        scan(transpose(target), transpose(source), mc, mr, "row")
        return out
    }

    /**
     * The gap's own row or column repeats one category (e.g. a column of dots) even when other
     * lines vary. Only used for categorical attributes such as shape, colour and fill.
     */
    fun gapLineRepeats(g: List<List<FeatureValue?>>, mr: Int, mc: Int): List<Hypothesis> {
        val out = mutableListOf<Hypothesis>()
        val row = g[mr].filterIndexed { i, _ -> i != mc }
        val col = g.indices.filter { it != mr }.map { g[it][mc] }
        for ((name, known) in listOf("row" to row, "column" to col)) {
            if (known.size >= 2 && known.none { it == null || it is Num } && Values.allEq(known)) {
                out += Hypothesis("this $name repeats one value", known.first()!!)
            }
        }
        return out
    }

    private fun transpose(g: List<List<FeatureValue?>>) = g[0].indices.map { c -> g.indices.map { r -> g[r][c] } }

    private fun mapping(g: List<List<FeatureValue?>>, mr: Int, mc: Int, s: Int): FeatureValue? {
        val pairs = g.indices.filter { it != mr }.map { g[it][s] to g[it][mc] }
        if (pairs.any { it.first == null || it.second == null }) return null
        // Numbers already have arithmetic hypotheses; look-up tables only make sense for symbols.
        if (pairs.any { it.first is Num || it.second is Num }) return null
        // The mapping must actually vary, otherwise it is just "this column is constant".
        if (Values.allEq(pairs.map { it.second })) return null
        val key = g[mr][s] ?: return null
        val matches = pairs.filter { Values.eq(it.first, key) }
        if (matches.isEmpty()) return null
        // A constant source column carries no information; that case is "each column is constant".
        if (Values.allEq(pairs.map { it.first })) return null
        // The mapping must be a function on the observed rows.
        for (a in pairs) for (b in pairs) if (Values.eq(a.first, b.first) && !Values.eq(a.second, b.second)) return null
        return matches.first().second
    }

    /** Hypotheses that treat each line (row, or column after transposition) as a unit. */
    private fun lineHypotheses(
        g: List<List<FeatureValue?>>,
        mr: Int,
        mc: Int,
        name: String,
        structural: Boolean,
    ): List<Hypothesis> {
        val out = mutableListOf<Hypothesis>()
        val cols = g[0].size
        val complete = g.indices.filter { it != mr }.map { g[it] }
        if (complete.any { line -> line.any { it == null } }) return out
        val partial = g[mr]
        val partialKnown = partial.filterIndexed { i, _ -> i != mc }.map { it!! }

        // Each line constant. A per-kind count that is zero in every complete line is no evidence.
        val trivial = !structural && complete.all { line -> line.all { Values.eq(it, Num(0.0)) } }
        if (complete.all { Values.allEq(it) } && Values.allEq(partialKnown) && !trivial) {
            out += Hypothesis("each $name is constant", partialKnown.first())
        }

        // Each line is a permutation of the same set of distinct values.
        if (structural && cols >= 3 && complete.size >= 2) {
            val ref = complete.first().map { it!! }
            val distinct = ref.indices.all { i -> ref.indices.none { j -> j != i && Values.eq(ref[i], ref[j]) } }
            fun sameSet(line: List<FeatureValue?>) = line.size == ref.size && ref.all { r -> line.any { Values.eq(it, r) } }
            if (distinct && complete.all { sameSet(it) }) {
                val remaining = ref.filter { r -> partialKnown.none { Values.eq(it, r) } }
                if (remaining.size == 1) out += Hypothesis("each $name holds each value once", remaining.single())
            }
        }
        val mod = Values.numericModulus(g.flatten().filterNotNull())
        if (mod != null) {
            val m = mod.m
            fun n(v: FeatureValue?) = (v as Num).v
            fun mk(x: Double) = Num(Values.clean(Values.norm(x, m)), m)
            // Constant step along every line (shared step).
            val steps = complete.flatMap { line -> (0 until cols - 1).map { Values.diff(n(line[it]), n(line[it + 1]), m) } }
            val d = steps.first()
            if (!Values.isZero(d, m) && steps.all { Values.numsEq(it, d, m) }) {
                predictFromStep(partial, mc, d, m)?.let { out += Hypothesis("constant step along each $name", mk(it)) }
            }
            // Constant step along every line, each line with its own step.
            if (cols >= 3) {
                val ok = complete.all { line ->
                    val s0 = Values.diff(n(line[0]), n(line[1]), m)
                    (1 until cols - 1).all { Values.numsEq(Values.diff(n(line[it]), n(line[it + 1]), m), s0, m) }
                }
                val anyNonZero = complete.any { !Values.isZero(Values.diff(n(it[0]), n(it[1]), m), m) }
                if (ok && anyNonZero) {
                    val idx = (0 until cols).filter { it != mc }
                    val a = idx[0]
                    val b = idx[1]
                    val step = Values.diff(n(partial[a]), n(partial[b]), m) / (b - a)
                    out += Hypothesis("each $name progresses steadily", mk(n(partial[a]) + step * (mc - a)))
                }
            }
            // Arithmetic combination of the first two cells.
            if (cols == 3) {
                val combos: List<Pair<String, (Double, Double) -> Double>> = listOf(
                    "third = first + second" to { x, y -> x + y },
                    "third = first − second" to { x, y -> x - y },
                    "third = second − first" to { x, y -> y - x },
                )
                for ((label, op) in combos) {
                    if (complete.all { Values.numsEq(op(n(it[0]), n(it[1])), n(it[2]), m) } &&
                        complete.any { !Values.isZero(n(it[0]), m) && !Values.isZero(n(it[1]), m) }
                    ) {
                        solveCombo(partial, mc, op, m)?.let { out += Hypothesis("$label in each $name", mk(it)) }
                    }
                }
            }
        }
        // Set algebra between the cells of each line.
        if (cols == 3 && g.flatten().filterNotNull().all { it is SetOf }) {
            fun s(v: FeatureValue?) = (v as SetOf).items
            val ops: List<Pair<String, (Set<String>, Set<String>) -> Set<String>>> = listOf(
                "superimpose the first two" to { a, b -> a union b },
                "keep what differs (XOR)" to { a, b -> (a union b) - (a intersect b) },
                "subtract the second from the first" to { a, b -> a - b },
                "keep only what is shared" to { a, b -> a intersect b },
            )
            for ((label, op) in ops) {
                if (complete.all { op(s(it[0]), s(it[1])) == s(it[2]) }) {
                    val pred: Set<String>? = when (mc) {
                        2 -> op(s(partial[0]), s(partial[1]))
                        else -> if (label.startsWith("keep what differs")) {
                            val other = if (mc == 0) s(partial[1]) else s(partial[0])
                            op(other, s(partial[2]))
                        } else {
                            null
                        }
                    }
                    if (pred != null) out += Hypothesis("$label in each $name", SetOf(pred))
                }
            }
        }
        return out
    }

    private fun predictFromStep(partial: List<FeatureValue?>, mc: Int, d: Double, m: Double?): Double? {
        val idx = partial.indices.firstOrNull { it != mc } ?: return null
        val base = (partial[idx] as Num).v
        val candidate = base + d * (mc - idx)
        // All known cells of the partial line must agree with the step.
        val consistent = partial.indices.filter { it != mc }.all { i ->
            Values.numsEq((partial[i] as Num).v, base + d * (i - idx), m)
        }
        return if (consistent) candidate else null
    }

    private fun solveCombo(partial: List<FeatureValue?>, mc: Int, op: (Double, Double) -> Double, m: Double?): Double? {
        fun n(i: Int) = (partial[i] as Num).v
        return when (mc) {
            2 -> op(n(0), n(1))
            else -> {
                // Search small integer/rotation candidates for the unknown operand.
                val range = if (m != null) (0 until m.toInt()).map { it.toDouble() } else (0..40).map { it.toDouble() }
                val sols = range.filter { c ->
                    val a = if (mc == 0) c else n(0)
                    val b = if (mc == 1) c else n(1)
                    Values.numsEq(op(a, b), n(2), m)
                }
                sols.singleOrNull()
            }
        }
    }
}
