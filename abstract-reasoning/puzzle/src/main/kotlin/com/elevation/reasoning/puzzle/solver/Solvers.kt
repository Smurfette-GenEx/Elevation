package com.elevation.reasoning.puzzle.solver

import com.elevation.reasoning.puzzle.engine.Axis
import com.elevation.reasoning.puzzle.engine.Transform
import com.elevation.reasoning.puzzle.geometry.Canonical
import com.elevation.reasoning.puzzle.model.Figure
import com.elevation.reasoning.puzzle.model.Ink

/**
 * Result of an independent analysis of a puzzle: which answer options can be justified by
 * at least one simple, consistent rule. A well-formed puzzle has exactly one such option.
 */
data class Analysis(
    val explainable: Set<Int>,
    val details: List<String>,
) {
    fun describe() = details.joinToString("\n")
}

/** A kind that never appears in the puzzle body says nothing about whether it may appear in the answer. */
private fun isAbsentThroughout(key: String, values: List<FeatureValue?>) =
    Features.isBreakdown(key) && values.all { Values.eq(it, FeatureValue.Num(0.0)) }

private fun defaultFor(key: String): FeatureValue? =
    if (key.startsWith(Features.COUNT_PREFIX)) FeatureValue.Num(0.0) else null

/** "a.ring" → "ring" for features of tracked elements; null for aggregate features. */
internal fun trackedAttribute(key: String): String? {
    if (Features.isBreakdown(key)) return null
    val head = key.substringBefore('.')
    if (head in setOf("count", "all", "mix", "sum", "set", "sym", "rel", "has", "parity", "distinct", "uniform", "largest", "inner")) return null
    return key.substringAfter('.', "").ifEmpty { null }
}

private val categorical = Regex("^(?!count\\.).*\\.(shape|ink|fill)$")

private val orientationKey = Regex("^(.+)\\.(orient|rot)$")

private val positionKey = Regex("^(.+)\\.(pos|ring|col|row)$")

/**
 * Decides which options every rule-governed attribute accepts.
 *
 * Features are grouped into attributes. Most attributes have one encoding, but an element's
 * position can be read as an exact spot, as a step around the board's edge (ring) or as a
 * column/row pair. A position is accepted when any governed encoding predicts it.
 */
private fun explain(
    hyps: Map<String, List<Hypothesis>>,
    optionCount: Int,
    value: (Int, String) -> FeatureValue?,
): Set<Int> {
    val governed = hyps.filterValues { it.isNotEmpty() }
    fun accepts(i: Int, key: String) = governed.getValue(key).any { Values.eq(it.prediction, value(i, key)) }
    val ok = (0 until optionCount).toMutableSet()
    val groups = governed.keys.groupBy { k ->
        positionKey.find(k)?.groupValues?.get(1)?.let { "$it.@position" }
            ?: orientationKey.find(k)?.groupValues?.get(1)?.let { "$it.@orientation" }
            ?: k
    }
    for ((group, keys) in groups) {
        if (group.endsWith(".@orientation")) {
            // Orientation is read either as a symbol or as an angle; either reading may justify an option.
            ok.removeAll { i -> keys.none { accepts(i, it) } }
            continue
        }
        if (!group.endsWith(".@position")) {
            ok.removeAll { i -> !accepts(i, keys.single()) }
            continue
        }
        val tag = group.removeSuffix(".@position")
        val encodings = listOf(listOf("$tag.pos"), listOf("$tag.ring"), listOf("$tag.col", "$tag.row"))
            .filter { enc -> enc.all { it in governed } }
        ok.removeAll { i -> encodings.none { enc -> enc.all { accepts(i, it) } } }
    }
    return ok
}

/** Sequence completion: infer each feature's rule from the frames and test every option. */
object SequenceSolver {
    fun analyse(frames: List<Figure>, options: List<Figure>): Analysis {
        val shown = frames.map { Features.extract(it) }
        val opts = options.map { Features.extract(it) }
        val keys = (shown + opts).flatMap { it.keys }.toSortedSet()
        val series = keys.associateWith { key -> shown.map { it[key] ?: defaultFor(key) } }
            .filterValues { vs -> vs.none { it == null } }
            .filterNot { (k, vs) -> isAbsentThroughout(k, vs) }
            .mapValues { e -> e.value.map { it!! } }
        val hyps = series.mapValues { (key, values) ->
            val h = SequenceHypotheses.predict(values, structural = !Features.isBreakdown(key)).toMutableList()
            // Lagged rule: an element takes over another element's previous value of the same attribute.
            if (values.size >= 3 && trackedAttribute(key) != null) {
                for ((other, ov) in series) {
                    if (other == key || Values.allEq(ov) || trackedAttribute(other) != trackedAttribute(key)) continue
                    if ((1 until values.size).all { Values.eq(values[it], ov[it - 1]) }) {
                        h += Hypothesis("copies the previous $other", ov.last())
                    }
                }
            }
            h
        }
        val details = hyps.filterValues { it.isNotEmpty() }.map { (key, h) ->
            "$key: ${series.getValue(key).joinToString()} → " + h.joinToString { "${it.prediction} (${it.rule})" }
        }
        return Analysis(explain(hyps, options.size) { i, key -> opts[i][key] ?: defaultFor(key) }, details)
    }
}

/** Matrix completion: infer row/column rules for each feature and test every option. */
object MatrixSolver {
    fun analyse(rows: Int, cols: Int, cells: List<Figure?>, options: List<Figure>): Analysis {
        val missing = cells.indexOfFirst { it == null }
        val mr = missing / cols
        val mc = missing % cols
        val fs = cells.map { it?.let { f -> Features.extract(f) } }
        val opts = options.map { Features.extract(it) }
        val keys = (fs.filterNotNull() + opts).flatMap { it.keys }.toSortedSet()
        val grids = keys.mapNotNull { key ->
            val flat = fs.map { m -> m?.let { it[key] ?: defaultFor(key) } }
            if (flat.filterIndexed { i, _ -> i != missing }.any { it == null }) return@mapNotNull null
            if (isAbsentThroughout(key, flat.filterNotNull())) return@mapNotNull null
            key to (0 until rows).map { r -> (0 until cols).map { c -> flat[r * cols + c] } }
        }.toMap()
        // Sources for cross-feature rules may be defined only in some cells (e.g. "sides" of a lone polygon).
        val sources = keys.filterNot { Features.isBreakdown(it) }.associateWith { key ->
            val flat = fs.map { m -> m?.get(key) }
            (0 until rows).map { r -> (0 until cols).map { c -> flat[r * cols + c] } }
        }
        val hyps = grids.mapValues { (key, grid) ->
            val h = MatrixHypotheses.predict(grid, mr, mc, structural = !Features.isBreakdown(key)).toMutableList()
            if (categorical.matches(key)) h += MatrixHypotheses.gapLineRepeats(grid, mr, mc)
            if (!Features.isBreakdown(key)) {
                for ((other, og) in sources) {
                    if (other != key && !Features.isBreakdown(other)) h += MatrixHypotheses.cross(grid, og, other, mr, mc)
                }
            }
            h
        }
        val details = hyps.filterValues { it.isNotEmpty() }.map { (key, h) -> "$key → " + h.joinToString { "${it.prediction} (${it.rule})" } }
        return Analysis(explain(hyps, options.size) { i, key -> opts[i][key] ?: defaultFor(key) }, details)
    }
}

/** An atomic property "feature = value". */
data class Predicate(val key: String, val value: FeatureValue) {
    fun test(features: Map<String, FeatureValue>): Boolean = Values.eq(features[key] ?: defaultFor(key), value)
    override fun toString() = "$key = $value"
}

/**
 * Odd-one-out and rule-deduction analysis based on shared atomic properties.
 */
object PredicateSolver {
    private fun featuresOf(f: Figure): Map<String, FeatureValue> {
        val base = Features.extract(f, relational = true).filterValues { it !is FeatureValue.SetOf }
        // Presence flags ("contains a triangle") derived from the breakdown counts.
        val presence = base.filterKeys { Features.isBreakdown(it) }
            .map { (k, v) -> "has." + k.removePrefix(Features.COUNT_PREFIX) to FeatureValue.Sym(((v as FeatureValue.Num).v > 0).toString()) }
        return base + presence
    }

    private fun defaultPredicateValue(key: String): FeatureValue? = when {
        key.startsWith("has.") -> FeatureValue.Sym("false")
        else -> defaultFor(key)
    }

    private fun Predicate.holds(features: Map<String, FeatureValue>) =
        Values.eq(features[key] ?: defaultPredicateValue(key), value)

    private fun predicatesSharedBy(group: List<Map<String, FeatureValue>>, keys: Set<String>): List<Predicate> =
        keys.mapNotNull { key ->
            val v = group.first()[key] ?: defaultPredicateValue(key) ?: return@mapNotNull null
            Predicate(key, v).takeIf { p -> group.all { p.holds(it) } }
        }

    /**
     * "The others have no squares" is not a property people accept as a shared rule, so absence-only
     * predicates are ignored for odd-one-out questions.
     */
    private fun isAbsence(p: Predicate) =
        (Features.isBreakdown(p.key) && Values.eq(p.value, FeatureValue.Num(0.0))) ||
            (p.key.startsWith("has.") && p.value == FeatureValue.Sym("false"))

    /** Every index that could be defended as "the odd one out". */
    fun oddOneOut(figures: List<Figure>): Analysis {
        val fs = figures.map(::featuresOf)
        val keys = fs.flatMap { it.keys }.toSet()
        val details = mutableListOf<String>()
        val valid = mutableSetOf<Int>()
        for (j in figures.indices) {
            val others = fs.filterIndexed { i, _ -> i != j }
            val distinguishing = predicatesSharedBy(others, keys).filterNot { isAbsence(it) }.filterNot { it.holds(fs[j]) }
            if (distinguishing.isNotEmpty()) {
                valid += j
                details += "option $j differs in: ${distinguishing.joinToString()}"
            }
        }
        return Analysis(valid, details)
    }

    /**
     * Options acceptable under some rule consistent with the examples. A rule is a conjunction of
     * properties shared by all "follows" figures that rejects every "breaks" figure.
     */
    fun ruleDeduction(follows: List<Figure>, breaks: List<Figure>, options: List<Figure>): Analysis {
        val pos = follows.map(::featuresOf)
        val neg = breaks.map(::featuresOf)
        val opts = options.map(::featuresOf)
        val keys = (pos + neg + opts).flatMap { it.keys }.toSet()
        val shared = predicatesSharedBy(pos, keys)
        val details = mutableListOf("shared by all examples: ${shared.joinToString()}")
        neg.forEachIndexed { i, n ->
            if (shared.all { it.holds(n) }) details += "counter-example $i satisfies every shared property"
        }
        val ok = mutableSetOf<Int>()
        opts.forEachIndexed { i, o ->
            val satisfied = shared.filter { it.holds(o) }
            val explainsNegatives = neg.all { n -> satisfied.any { !it.holds(n) } }
            if (explainsNegatives) ok += i
            if (satisfied.size < shared.size) {
                details += "option $i breaks: ${shared.filterNot { it.holds(o) }.joinToString()}"
            }
        }
        return Analysis(ok, details)
    }
}

/** Visual relationship analysis over a library of whole-figure transformations. */
object RelationSolver {
    /**
     * Every combination of: one geometric change (rotation or mirror), an optional fill inversion,
     * an optional ink swap, an optional rescale and an optional one-step move (before or after the
     * geometric change). Several thousand candidates, so any rule a player could reasonably infer
     * is considered.
     */
    val library: List<Transform> by lazy {
        val geo: List<Transform?> = listOf<Transform?>(null) +
            listOf(45, 90, 135, 180, 225, 270, 315).map { Transform.Rotate(it) } +
            Axis.entries.map { Transform.Reflect(it) }
        val fills: List<Transform?> = listOf(null, Transform.InvertFill)
        val inks = Ink.entries
        val swaps: List<Transform?> = listOf<Transform?>(null) +
            inks.indices.flatMap { i -> (i + 1 until inks.size).map { j -> Transform.SwapInks(inks[i], inks[j]) } }
        val scales: List<Transform?> = listOf(null, Transform.Scale(0.5f), Transform.Scale(2f))
        val shifts: List<Transform?> = listOf(null, Transform.Shift(1, 0), Transform.Shift(-1, 0), Transform.Shift(0, 1), Transform.Shift(0, -1))
        buildList {
            for (g in geo) for (fl in fills) for (sw in swaps) for (sc in scales) for (sh in shifts) {
                val orders = if (sh != null && g != null) listOf(listOf(sh, g), listOf(g, sh)) else listOf(listOf(g, sh))
                for (o in orders) {
                    val steps = (o + listOf(fl, sw, sc)).filterNotNull()
                    if (steps.isNotEmpty()) add(if (steps.size == 1) steps.single() else Transform.Then(steps))
                }
            }
        }
    }

    fun consistent(examples: List<Pair<Figure, Figure>>, candidates: List<Transform> = library): List<Transform> =
        candidates.filter { t -> examples.all { (a, b) -> Canonical.same(t.apply(a), b) } }

    /** Which figure options equal T(query) for some transformation T consistent with the examples. */
    fun analyseFigures(examples: List<Pair<Figure, Figure>>, query: Figure, options: List<Figure>): Analysis {
        val ts = consistent(examples)
        val results = ts.map { it.apply(query) }
        val ok = options.indices.filter { i -> results.any { Canonical.same(it, options[i]) } }.toSet()
        return Analysis(ok, listOf("consistent transformations: ${ts.take(8).joinToString { it.label }}${if (ts.size > 8) " …" else ""}"))
    }

    /** Which named transformations reproduce every example. */
    fun analyseTransforms(examples: List<Pair<Figure, Figure>>, options: List<Transform>): Analysis {
        val ok = options.indices.filter { i -> examples.all { (a, b) -> Canonical.same(options[i].apply(a), b) } }.toSet()
        return Analysis(ok, options.mapIndexed { i, t -> "$i: ${t.label} → ${if (i in ok) "fits" else "does not fit"}" })
    }
}
