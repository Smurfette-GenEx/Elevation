package com.elevation.reasoning.puzzle.solver

import com.elevation.reasoning.puzzle.engine.Axis
import com.elevation.reasoning.puzzle.engine.Transform
import com.elevation.reasoning.puzzle.geometry.Canonical
import com.elevation.reasoning.puzzle.geometry.ShapeGeometry
import com.elevation.reasoning.puzzle.model.Element
import com.elevation.reasoning.puzzle.model.Figure
import com.elevation.reasoning.puzzle.model.Lattice
import kotlin.math.abs
import kotlin.math.roundToInt

/** An observable property value of a figure. */
sealed interface FeatureValue {
    /** A number; when [modulus] is set the value is cyclic (e.g. rotation, ring position). */
    data class Num(val v: Double, val modulus: Double? = null) : FeatureValue {
        override fun toString() = if (modulus == null) fmt(v) else "${fmt(v)} (mod ${fmt(modulus)})"
    }

    data class Sym(val v: String) : FeatureValue {
        override fun toString() = v
    }

    data class SetOf(val items: Set<String>) : FeatureValue {
        override fun toString() = items.sorted().toString()
    }

    companion object {
        fun fmt(d: Double) = if (d == d.roundToInt().toDouble()) d.roundToInt().toString() else "%.2f".format(d)
    }
}

/**
 * Extracts the observable properties a human could reason about from a figure.
 *
 * Features are split into:
 *  - aggregate features (counts, uniform attributes, compositions, symmetry), always present;
 *  - tracked features of tagged elements ("main.rot", "dot.ring", …), letting the solver follow
 *    one element across frames. A figure with a single untagged element tags it "main".
 */
object Features {
    const val COUNT_PREFIX = "count."

    /** Per-attribute breakdown counts ("count.shape.CIRCLE") only follow numeric rules, never cycles or tables. */
    fun isBreakdown(key: String) = key.startsWith(COUNT_PREFIX)

    fun extract(f: Figure, relational: Boolean = false): Map<String, FeatureValue> {
        val out = LinkedHashMap<String, FeatureValue>()
        val els = f.elements
        out["count"] = num(els.size)
        els.groupBy { it.shape }.forEach { (k, v) -> out["${COUNT_PREFIX}shape.$k"] = num(v.size) }
        els.groupBy { it.ink }.forEach { (k, v) -> out["${COUNT_PREFIX}ink.$k"] = num(v.size) }
        els.groupBy { fillOf(it) }.forEach { (k, v) -> out["${COUNT_PREFIX}fill.$k"] = num(v.size) }

        if (els.isNotEmpty()) {
            uniform(els) { it.shape.name }?.let { out["all.shape"] = sym(it) }
            uniform(els) { it.ink.name }?.let { out["all.ink"] = sym(it) }
            uniform(els) { fillOf(it).name }?.let { out["all.fill"] = sym(it) }
            uniform(els) { r2(it.size).toString() }?.let { out["all.size"] = FeatureValue.Num(r2(els[0].size)) }
            if (relational) {
                out["mix.shape"] = sym(els.map { it.shape.name }.sorted().joinToString("+"))
                out["mix.ink"] = sym(els.map { it.ink.name }.sorted().joinToString("+"))
            }
            if (els.all { it.shape.sides != null }) {
                out["sum.sides"] = num(els.sumOf { it.shape.sides!! })
            }
            // Shared orientation of a group of identical shapes (e.g. a cluster of arrows all turning together).
            if (els.map { it.shape }.distinct().size == 1) {
                val orients = els.map { Canonical.orientation(it) }
                if (orients.distinct().size == 1) {
                    val (m, r) = orients.first()
                    out["all.orient"] = sym("${if (m) "m" else ""}$r")
                    val period = Canonical.rotationPeriod(els[0].shape)
                    if (period > 0 && !m) out["all.rot"] = FeatureValue.Num(r.toDouble(), period.toDouble())
                }
            }
            uniform(els) { it.shape.sides?.toString() ?: "-" }?.takeIf { it != "-" }?.let { out["all.sides"] = num(it.toInt()) }
        }
        out["set"] = FeatureValue.SetOf(els.map { Canonical.key(it) }.toSet())

        tracked(f).forEach { (tag, e) -> elementFeatures(tag, e, out) }

        if (relational) relationalFeatures(f, out)
        return out
    }

    /** Elements tracked by identity: explicit tags, or the only element of a single-element figure. */
    fun tracked(f: Figure): Map<String, Element> {
        val tagged = f.elements.filter { it.tag != null }.groupBy { it.tag!! }.filterValues { it.size == 1 }
            .mapValues { it.value.single() }
        if (tagged.isNotEmpty()) return tagged
        return if (f.elements.size == 1) mapOf("main" to f.elements.single()) else emptyMap()
    }

    private fun elementFeatures(tag: String, e: Element, out: MutableMap<String, FeatureValue>) {
        val (m, r) = Canonical.orientation(e)
        val period = Canonical.rotationPeriod(e.shape)
        out["$tag.shape"] = sym(e.shape.name)
        out["$tag.ink"] = sym(e.ink.name)
        out["$tag.fill"] = sym(fillOf(e).name)
        out["$tag.size"] = FeatureValue.Num(r2(e.size))
        out["$tag.orient"] = sym("${if (m) "m" else ""}$r")
        if (period > 0 && !m) out["$tag.rot"] = FeatureValue.Num(r.toDouble(), period.toDouble())
        out["$tag.pos"] = sym("${r2(e.x)},${r2(e.y)}")
        val col = latticeIndex(e.x)
        val row = latticeIndex(e.y)
        if (col != null && row != null) {
            out["$tag.col"] = FeatureValue.Num(col.toDouble(), 3.0)
            out["$tag.row"] = FeatureValue.Num(row.toDouble(), 3.0)
            val ring = Lattice.ring.indexOf(col to row)
            if (ring >= 0) out["$tag.ring"] = FeatureValue.Num(ring.toDouble(), 8.0)
        }
        e.shape.sides?.let { out["$tag.sides"] = num(it) }
    }

    /** Extra higher-level properties used by odd-one-out and rule-deduction questions. */
    private fun relationalFeatures(f: Figure, out: MutableMap<String, FeatureValue>) {
        val els = f.elements
        out["sym.vertical"] = bool(Canonical.same(f, Transform.Reflect(Axis.VERTICAL).apply(f)))
        out["sym.horizontal"] = bool(Canonical.same(f, Transform.Reflect(Axis.HORIZONTAL).apply(f)))
        out["sym.halfTurn"] = bool(Canonical.same(f, Transform.Rotate(180).apply(f)))
        out["sym.quarterTurn"] = bool(Canonical.same(f, Transform.Rotate(90).apply(f)))
        out["parity.count"] = sym(if (els.size % 2 == 0) "even" else "odd")
        out["distinct.shapes"] = num(els.map { it.shape }.distinct().size)
        out["distinct.inks"] = num(els.map { it.ink }.distinct().size)
        out["distinct.fills"] = num(els.map { fillOf(it) }.distinct().size)
        out["has.curve"] = bool(els.any { it.shape.curved })
        out["uniform.shape"] = bool(els.map { it.shape }.distinct().size <= 1)
        out["uniform.ink"] = bool(els.map { it.ink }.distinct().size <= 1)
        out["uniform.fill"] = bool(els.map { fillOf(it) }.distinct().size <= 1)
        if (els.isEmpty()) return

        val largest = els.maxBy { it.size }
        val others = els - largest
        val largestUnique = els.count { r2(it.size) == r2(largest.size) } == 1
        if (largestUnique) {
            out["largest.shape"] = sym(largest.shape.name)
            out["largest.ink"] = sym(largest.ink.name)
            out["largest.fill"] = sym(fillOf(largest).name)
            out["inner.count"] = num(others.size)
            if (others.isNotEmpty()) {
                uniform(others) { it.shape.name }?.let { out["inner.shape"] = sym(it) }
                uniform(others) { it.ink.name }?.let { out["inner.ink"] = sym(it) }
                out["rel.innerSameShape"] = bool(others.all { it.shape == largest.shape })
                out["rel.innerSameInk"] = bool(others.all { it.ink == largest.ink })
                val b = ShapeGeometry.bounds(largest)
                out["rel.innerInside"] = bool(others.all { inside(it, b) })
            }
            largest.shape.sides?.let { sides ->
                out["largest.sides"] = num(sides)
                out["rel.innerCountEqualsSides"] = bool(others.size == sides)
                val innerSides = others.mapNotNull { it.shape.sides }
                if (innerSides.size == others.size && others.isNotEmpty()) {
                    out["rel.innerSidesSumEqualsSides"] = bool(innerSides.sum() == sides)
                }
            }
        }
        val solid = els.count { fillOf(it) == com.elevation.reasoning.puzzle.model.Fill.SOLID }
        val outline = els.count { fillOf(it) == com.elevation.reasoning.puzzle.model.Fill.OUTLINE }
        out["rel.solidVsOutline"] = sym(
            when {
                solid > outline -> "more-solid"
                solid < outline -> "more-outline"
                else -> "balanced"
            },
        )

        // Pairwise relations between shapes that occur exactly once.
        val singles = els.groupBy { it.shape }.filterValues { it.size == 1 }.mapValues { it.value.single() }
        val kinds = singles.keys.sortedBy { it.name }
        for (i in kinds.indices) for (j in kinds.indices) {
            if (i == j) continue
            val a = singles.getValue(kinds[i])
            val b = singles.getValue(kinds[j])
            if (i < j) {
                out["rel.${kinds[i]}.above.${kinds[j]}"] = bool(a.y < b.y - 0.05f)
                out["rel.${kinds[i]}.leftOf.${kinds[j]}"] = bool(a.x < b.x - 0.05f)
                out["rel.${kinds[i]}.sameInk.${kinds[j]}"] = bool(a.ink == b.ink)
            }
            if (a.size < b.size) out["rel.${kinds[i]}.inside.${kinds[j]}"] = bool(inside(a, ShapeGeometry.bounds(b)))
        }
    }

    private fun inside(e: Element, b: FloatArray) =
        e.x > b[0] && e.x < b[2] && e.y > b[1] && e.y < b[3]

    private fun latticeIndex(v: Float): Int? =
        Lattice.coords.indexOfFirst { abs(it - v) < 0.01f }.takeIf { it >= 0 }

    private fun fillOf(e: Element) =
        if (ShapeGeometry.isStroke(e.shape)) com.elevation.reasoning.puzzle.model.Fill.OUTLINE else e.fill

    private inline fun uniform(els: List<Element>, f: (Element) -> String): String? =
        els.map(f).distinct().singleOrNull()

    private fun num(i: Int) = FeatureValue.Num(i.toDouble())
    private fun sym(s: String) = FeatureValue.Sym(s)
    private fun bool(b: Boolean) = FeatureValue.Sym(b.toString())
    private fun r2(v: Float) = (v * 100).roundToInt() / 100.0
}
