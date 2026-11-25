package com.elevation.reasoning.puzzle.engine

import com.elevation.reasoning.puzzle.geometry.Canonical
import com.elevation.reasoning.puzzle.model.Element
import com.elevation.reasoning.puzzle.model.Figure
import com.elevation.reasoning.puzzle.model.Fill
import com.elevation.reasoning.puzzle.model.Ink
import com.elevation.reasoning.puzzle.model.Lattice
import com.elevation.reasoning.puzzle.model.ShapeKind

/** Convenience operations used when authoring puzzle content. */

/** Applies [change] to the element(s) carrying [tag]. */
fun Figure.editTag(tag: String, change: (Element) -> Element): Figure {
    require(elements.any { it.tag == tag }) { "No element tagged '$tag'" }
    return map { if (it.tag == tag) change(it) else it }
}

fun Figure.rotate(deg: Int) = Transform.Rotate(deg).apply(this)
fun Figure.reflect(axis: Axis) = Transform.Reflect(axis).apply(this)
fun Figure.then(vararg t: Transform) = Transform.Then(t.toList()).apply(this)

/** Rotates each element in place (positions unchanged). */
fun Figure.spin(deg: Int) = map { it.copy(rotation = Canonical.normalize(it.rotation + deg)) }
fun Figure.recolor(ink: Ink) = map { it.copy(ink = ink) }
fun Figure.refill(fill: Fill) = map { it.copy(fill = fill) }
fun Figure.resize(size: Float) = map { it.copy(size = size) }
fun Figure.reshape(shape: ShapeKind) = map { it.copy(shape = shape) }
fun Figure.plus(e: Element) = copy(elements = elements + e)
fun Figure.without(index: Int) = copy(elements = elements.filterIndexed { i, _ -> i != index })

fun Element.at(col: Int, row: Int) = copy(x = Lattice.x(col), y = Lattice.y(row))
fun Element.atRing(index: Int): Element {
    val (c, r) = Lattice.ring[((index % 8) + 8) % 8]
    return at(c, r)
}
fun Element.spun(deg: Int) = copy(rotation = Canonical.normalize(rotation + deg))
