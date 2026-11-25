package com.elevation.reasoning.puzzle

import com.elevation.reasoning.puzzle.content.PuzzleCatalog
import com.elevation.reasoning.puzzle.engine.Transform
import com.elevation.reasoning.puzzle.geometry.ShapeGeometry
import com.elevation.reasoning.puzzle.model.AnswerOption
import com.elevation.reasoning.puzzle.model.Element
import com.elevation.reasoning.puzzle.model.Figure
import com.elevation.reasoning.puzzle.model.Fill
import com.elevation.reasoning.puzzle.model.PuzzleBody
import com.elevation.reasoning.puzzle.model.ShapeKind
import org.junit.Test
import java.io.File
import kotlin.math.roundToInt

/**
 * Exports the validated catalogue for the HTML edition: every element is pre-computed as vector
 * geometry with the same outlines the Android renderer uses. Run with -Dweb=<output json>.
 */
class WebExporter {
    private fun n(v: Float) = ((v * 1000).roundToInt() / 1000.0).let { if (it == it.toLong().toDouble()) it.toLong().toString() else it.toString() }
    private fun s(v: String) = "\"" + v.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

    private fun el(e: Element): String {
        val ink = "\"i\":\"${e.ink.code}\",\"k\":\"${e.shape.displayName}\""
        val fill = "\"f\":\"" + when (e.fill) { Fill.SOLID -> "s"; Fill.OUTLINE -> "o"; Fill.STRIPED -> "x" } + "\""
        return when (e.shape) {
            ShapeKind.CIRCLE -> "{$ink,$fill,\"c\":[${n(e.x)},${n(e.y)},${n(e.size)}]}"
            ShapeKind.LINE -> { val p = ShapeGeometry.placedOutline(e); "{$ink,\"l\":[${n(p[0].x)},${n(p[0].y)},${n(p[1].x)},${n(p[1].y)}]}" }
            else -> "{$ink,$fill,\"p\":[" + ShapeGeometry.placedOutline(e).joinToString(",") { "${n(it.x)},${n(it.y)}" } + "]}"
        }
    }

    private fun fig(f: Figure?): String = if (f == null) "null" else
        "{" + (if (f.board) "\"b\":1," else "") + "\"e\":[" + f.elements.joinToString(",") { el(it) } + "]}"

    private fun icon(t: Transform): String = when (t) {
        is Transform.Rotate -> "{\"t\":\"rot\",\"d\":${t.degrees}}"
        is Transform.Reflect -> "{\"t\":\"mir\",\"a\":${t.axis.angleFromVertical}}"
        is Transform.SwapInks -> "{\"t\":\"swap\",\"a\":\"${t.a.code}\",\"b\":\"${t.b.code}\"}"
        Transform.InvertFill -> "{\"t\":\"inv\"}"
        is Transform.Shift -> "{\"t\":\"shift\",\"dx\":${t.dx},\"dy\":${t.dy}}"
        is Transform.Scale -> "{\"t\":\"scale\"}"
        is Transform.Remove -> "{\"t\":\"rem\",\"g\":${fig(Figure(Element(t.shape, size = 0.55f)))}}"
        is Transform.Add -> "{\"t\":\"add\",\"g\":${fig(Figure(t.element.copy(size = 0.55f, x = 0f, y = 0f)))}}"
        is Transform.Then -> "{\"t\":\"rot\",\"d\":90}"
    }

    private fun steps(t: Transform) = ((t as? Transform.Then)?.steps ?: listOf(t))

    @Test
    fun export() {
        val out = System.getProperty("web")?.takeIf { it.isNotBlank() } ?: return
        val chapters = PuzzleCatalog.chapters.joinToString(",\n") {
            "{\"n\":${it.number},\"title\":${s(it.title)},\"subtitle\":${s(it.subtitle)}}"
        }
        val levels = PuzzleCatalog.puzzles.joinToString(",\n") { p ->
            val body = when (val b = p.body) {
                is PuzzleBody.Sequence -> "{\"kind\":\"sequence\",\"frames\":[${b.frames.joinToString(",") { fig(it) }}]}"
                is PuzzleBody.Matrix -> "{\"kind\":\"matrix\",\"rows\":${b.rows},\"cols\":${b.cols},\"cells\":[${b.cells.joinToString(",") { fig(it) }}]}"
                is PuzzleBody.Transformation -> "{\"kind\":\"transformation\",\"start\":${fig(b.start)},\"steps\":[" +
                    b.steps.joinToString(",") { "{\"label\":${s(it.label)},\"icon\":${icon(it)}}" } + "]}"
                PuzzleBody.OddOneOut -> "{\"kind\":\"odd\"}"
                is PuzzleBody.Relationship -> "{\"kind\":\"relationship\",\"examples\":[" +
                    b.examples.joinToString(",") { "[${fig(it.first)},${fig(it.second)}]" } + "],\"query\":${fig(b.query)}}"
                is PuzzleBody.RuleDeduction -> "{\"kind\":\"rule\",\"follows\":[${b.follows.joinToString(",") { fig(it) }}],\"breaks\":[${b.breaks.joinToString(",") { fig(it) }}]}"
            }
            val options = p.options.joinToString(",") { o ->
                when (o) {
                    is AnswerOption.FigureOption -> "{\"fig\":${fig(o.figure)}}"
                    is AnswerOption.TransformOption -> "{\"label\":${s(o.label)},\"icons\":[${steps(o.transform).joinToString(",") { icon(it) }}]}"
                }
            }
            "{\"level\":${p.level},\"chapter\":${p.chapter},\"title\":${s(p.title)},\"type\":\"${p.type.name}\",\"difficulty\":${p.difficulty}," +
                "\"prompt\":${s(p.prompt)},\"explanation\":${s(p.explanation)},\"hints\":[${p.hints.joinToString(",") { s(it) }}]," +
                "\"target\":${p.targetSeconds},\"correct\":${p.correctIndex},\"body\":$body,\"options\":[$options]}"
        }
        File(out).apply { parentFile.mkdirs() }.writeText("{\"chapters\":[\n$chapters\n],\"levels\":[\n$levels\n]}\n")
    }
}
