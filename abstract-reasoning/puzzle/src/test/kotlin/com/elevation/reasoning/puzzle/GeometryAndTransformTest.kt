package com.elevation.reasoning.puzzle

import com.elevation.reasoning.puzzle.engine.Axis
import com.elevation.reasoning.puzzle.engine.Transform
import com.elevation.reasoning.puzzle.geometry.Canonical
import com.elevation.reasoning.puzzle.geometry.ShapeGeometry
import com.elevation.reasoning.puzzle.model.Element
import com.elevation.reasoning.puzzle.model.Figure
import com.elevation.reasoning.puzzle.model.Lattice
import com.elevation.reasoning.puzzle.model.ShapeKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class GeometryAndTransformTest {

    @Test
    fun rotationalSymmetryPeriods() {
        assertEquals(0, Canonical.rotationPeriod(ShapeKind.CIRCLE))
        assertEquals(90, Canonical.rotationPeriod(ShapeKind.SQUARE))
        assertEquals(120, Canonical.rotationPeriod(ShapeKind.TRIANGLE))
        assertEquals(72, Canonical.rotationPeriod(ShapeKind.PENTAGON))
        assertEquals(60, Canonical.rotationPeriod(ShapeKind.HEXAGON))
        assertEquals(180, Canonical.rotationPeriod(ShapeKind.LINE))
        assertEquals(180, Canonical.rotationPeriod(ShapeKind.RECTANGLE))
        assertEquals(360, Canonical.rotationPeriod(ShapeKind.ARROW))
        assertEquals(360, Canonical.rotationPeriod(ShapeKind.FLAG))
    }

    @Test
    fun chiralityIsDetected() {
        assertTrue(Canonical.isAchiral(ShapeKind.ARROW))
        assertTrue(Canonical.isAchiral(ShapeKind.RIGHT_TRIANGLE))
        assertFalse(Canonical.isAchiral(ShapeKind.FLAG))
        assertFalse(Canonical.isAchiral(ShapeKind.L_SHAPE))
    }

    @Test
    fun visuallyIdenticalElementsShareAKey() {
        assertEquals(Canonical.key(Element(ShapeKind.SQUARE)), Canonical.key(Element(ShapeKind.SQUARE, rotation = 90)))
        assertEquals(Canonical.key(Element(ShapeKind.ARROW)), Canonical.key(Element(ShapeKind.ARROW, mirrored = true)))
        assertTrue(Canonical.key(Element(ShapeKind.FLAG)) != Canonical.key(Element(ShapeKind.FLAG, mirrored = true)))
        assertEquals(Canonical.key(Element(ShapeKind.CIRCLE)), Canonical.key(Element(ShapeKind.CIRCLE, rotation = 17)))
    }

    @Test
    fun figureKeyIgnoresOrderAndTags() {
        val a = Figure(Element(ShapeKind.CIRCLE, x = 0.3f, tag = "a"), Element(ShapeKind.SQUARE, x = -0.3f))
        val b = Figure(Element(ShapeKind.SQUARE, x = -0.3f), Element(ShapeKind.CIRCLE, x = 0.3f))
        assertTrue(Canonical.same(a, b))
    }

    @Test
    fun fourQuarterTurnsAreIdentity() {
        val f = Figure(Element(ShapeKind.FLAG, size = 0.3f, x = Lattice.x(0), y = Lattice.y(1)))
        val back = (1..4).fold(f) { acc, _ -> Transform.Rotate(90).apply(acc) }
        assertTrue(Canonical.same(f, back))
    }

    @Test
    fun rotationMovesLatticePositionsClockwise() {
        val top = Figure(Element(ShapeKind.CIRCLE, size = 0.2f, x = 0f, y = -Lattice.STEP))
        val e = Transform.Rotate(90).apply(top).elements.single()
        assertEquals(Lattice.STEP, e.x, 1e-4f)
        assertEquals(0f, e.y, 1e-4f)
    }

    @Test
    fun mirrorTwiceIsIdentityAndTwoMirrorsMakeATurn() {
        val f = Figure(Element(ShapeKind.FLAG, size = 0.3f, x = 0.3f, y = -0.2f))
        Axis.entries.forEach { ax ->
            assertTrue(ax.name, Canonical.same(f, Transform.Reflect(ax).apply(Transform.Reflect(ax).apply(f))))
        }
        val twoMirrors = Transform.Then(Transform.Reflect(Axis.VERTICAL), Transform.Reflect(Axis.HORIZONTAL)).apply(f)
        assertTrue(Canonical.same(Transform.Rotate(180).apply(f), twoMirrors))
    }

    @Test
    fun turnMirrorTurnEqualsMirror() {
        val f = Figure(Element(ShapeKind.FLAG))
        val r = Transform.Then(Transform.Rotate(90), Transform.Reflect(Axis.VERTICAL), Transform.Rotate(90)).apply(f)
        assertTrue(Canonical.same(Transform.Reflect(Axis.VERTICAL).apply(f), r))
    }

    @Test
    fun everyShapeOutlineFitsTheUnitBox() {
        ShapeKind.entries.forEach { k ->
            val pts = ShapeGeometry.outline(k)
            assertTrue(k.name, pts.size >= 2)
            assertTrue(k.name, pts.all { abs(it.x) <= 1.001f && abs(it.y) <= 1.001f })
        }
    }
}
