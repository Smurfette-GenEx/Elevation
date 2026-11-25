package com.elevation.reasoning.feedback

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin

enum class Sound { SELECT, CORRECT, WRONG, LEVEL_COMPLETE }

/**
 * Short, soft sound effects synthesised at start-up — no audio files, no external services.
 * Each sound is a few sine partials with a smooth envelope so it stays unobtrusive.
 */
class SoundPlayer {
    private val sampleRate = 22_050
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val tracks = HashMap<Sound, AudioTrack>()

    init {
        scope.launch {
            Sound.entries.forEach { s -> runCatching { tracks[s] = build(synthesize(s)) } }
        }
    }

    fun play(sound: Sound) {
        val track = tracks[sound] ?: return
        scope.launch {
            runCatching {
                track.stop()
                track.reloadStaticData()
                track.play()
            }
        }
    }

    fun release() {
        tracks.values.forEach { runCatching { it.release() } }
        tracks.clear()
    }

    private fun synthesize(s: Sound): ShortArray = when (s) {
        Sound.SELECT -> notes(listOf(1318.5 to 0.035), volume = 0.18)
        Sound.CORRECT -> notes(listOf(659.3 to 0.09, 987.8 to 0.16), volume = 0.28)
        Sound.WRONG -> notes(listOf(246.9 to 0.11, 207.7 to 0.16), volume = 0.25)
        Sound.LEVEL_COMPLETE -> notes(listOf(523.3 to 0.08, 659.3 to 0.08, 784.0 to 0.08, 1046.5 to 0.22), volume = 0.26)
    }

    private fun notes(seq: List<Pair<Double, Double>>, volume: Double): ShortArray {
        val out = ArrayList<Short>()
        for ((freq, dur) in seq) {
            val n = (sampleRate * dur).toInt()
            for (i in 0 until n) {
                val t = i.toDouble() / sampleRate
                val attack = (i / (sampleRate * 0.005)).coerceAtMost(1.0)
                val env = attack * exp(-4.0 * t / dur)
                val v = sin(2 * PI * freq * t) + 0.25 * sin(4 * PI * freq * t)
                out += (v * env * volume * Short.MAX_VALUE / 1.25).toInt().toShort()
            }
        }
        return out.toShortArray()
    }

    private fun build(data: ShortArray): AudioTrack {
        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_GAME)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(sampleRate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
            )
            .setBufferSizeInBytes(data.size * 2)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build()
        track.write(data, 0, data.size)
        return track
    }
}
