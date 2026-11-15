package com.blockmuddle.game

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import java.io.File
import java.io.FileOutputStream
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

class SoundAndHapticManager(context: Context) {

    companion object {
        private const val PREFS_NAME = "block_muddle_audio"
        private const val KEY_SOUND = "sound_enabled"
        private const val KEY_HAPTICS = "haptics_enabled"
        private const val SAMPLE_RATE = 22050
    }

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    var isSoundEnabled: Boolean = prefs.getBoolean(KEY_SOUND, true)
        set(value) {
            field = value
            prefs.edit().putBoolean(KEY_SOUND, value).apply()
        }

    var isHapticsEnabled: Boolean = prefs.getBoolean(KEY_HAPTICS, true)
        set(value) {
            field = value
            prefs.edit().putBoolean(KEY_HAPTICS, value).apply()
        }

    private val soundPool: SoundPool
    private var pickupId = 0
    private var dropId = 0
    private var clearId = 0
    private var powerUpId = 0
    private var gameOverId = 0

    private val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val manager = appContext.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        manager?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        appContext.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    init {
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_GAME)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        soundPool = SoundPool.Builder()
            .setMaxStreams(6)
            .setAudioAttributes(attrs)
            .build()

        loadSynthesizedEffects()
    }

    private fun loadSynthesizedEffects() {
        pickupId = loadToneWav("sfx_pickup.wav", 380.0, 560.0, 0.08)
        dropId = loadToneWav("sfx_drop.wav", 210.0, 105.0, 0.10)
        clearId = loadChordWav("sfx_clear.wav", doubleArrayOf(523.25, 659.25, 783.99), 0.28)
        powerUpId = loadChordWav("sfx_powerup.wav", doubleArrayOf(587.33, 739.99, 880.0, 1174.66), 0.30)
        gameOverId = loadToneWav("sfx_gameover.wav", 330.0, 175.0, 0.42)
    }

    fun playPickup() {
        triggerHaptic(14L, 70)
        if (isSoundEnabled && pickupId != 0) {
            soundPool.play(pickupId, 0.7f, 0.7f, 1, 0, 1.0f)
        }
    }

    fun playDrop() {
        triggerHaptic(20L, 110)
        if (isSoundEnabled && dropId != 0) {
            soundPool.play(dropId, 0.85f, 0.85f, 1, 0, 1.0f)
        }
    }

    fun playLineClear(comboStreak: Int) {
        triggerHaptic(35L, 180)
        if (isSoundEnabled && clearId != 0) {
            // Ascending pitch multiplier as combo streak rises (clamped cleanly within SoundPool 0.5..2.0 range)
            val semitoneSteps = min(comboStreak - 1, 6).coerceAtLeast(0)
            val rate = 2.0.pow(semitoneSteps / 12.0).toFloat().coerceIn(1.0f, 1.8f)
            soundPool.play(clearId, 0.95f, 0.95f, 2, 0, rate)
        }
    }

    fun playPowerUp() {
        triggerHaptic(28L, 150)
        if (isSoundEnabled && powerUpId != 0) {
            soundPool.play(powerUpId, 0.9f, 0.9f, 2, 0, 1.0f)
        }
    }

    fun playGameOver() {
        triggerHaptic(75L, 220)
        if (isSoundEnabled && gameOverId != 0) {
            soundPool.play(gameOverId, 0.85f, 0.85f, 2, 0, 1.0f)
        }
    }

    private fun triggerHaptic(durationMs: Long, amplitude: Int) {
        if (!isHapticsEnabled || vibrator == null || !vibrator.hasVibrator()) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(durationMs, amplitude))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(durationMs)
        }
    }

    fun release() {
        soundPool.release()
    }

    private fun loadToneWav(name: String, startHz: Double, endHz: Double, durationSec: Double): Int {
        val numSamples = (SAMPLE_RATE * durationSec).toInt()
        val pcm = ShortArray(numSamples)
        var phase = 0.0
        for (i in 0 until numSamples) {
            val t = i.toDouble() / numSamples
            val freq = startHz + (endHz - startHz) * t
            phase += 2.0 * PI * freq / SAMPLE_RATE
            val envelope = exp(-4.5 * t) * (1.0 - exp(-60.0 * t))
            pcm[i] = (sin(phase) * envelope * 24000.0).toInt().coerceIn(-32767, 32767).toShort()
        }
        return writeAndLoadWav(name, pcm)
    }

    private fun loadChordWav(name: String, freqs: DoubleArray, durationSec: Double): Int {
        val numSamples = (SAMPLE_RATE * durationSec).toInt()
        val pcm = ShortArray(numSamples)
        for (i in 0 until numSamples) {
            val t = i.toDouble() / numSamples
            var sample = 0.0
            for (idx in freqs.indices) {
                val delay = idx * 0.12
                if (t >= delay) {
                    val localT = (t - delay) / (1.0 - delay)
                    val env = exp(-3.5 * localT) * (1.0 - exp(-50.0 * localT))
                    sample += sin(2.0 * PI * freqs[idx] * (i.toDouble() / SAMPLE_RATE)) * env
                }
            }
            pcm[i] = ((sample / freqs.size) * 26000.0).toInt().coerceIn(-32767, 32767).toShort()
        }
        return writeAndLoadWav(name, pcm)
    }

    private fun writeAndLoadWav(filename: String, pcm: ShortArray): Int {
        val file = File(appContext.cacheDir, filename)
        val byteData = ByteArray(pcm.size * 2)
        for (i in pcm.indices) {
            byteData[i * 2] = (pcm[i].toInt() and 0xFF).toByte()
            byteData[i * 2 + 1] = ((pcm[i].toInt() shr 8) and 0xFF).toByte()
        }
        FileOutputStream(file).use { out ->
            val dataSize = byteData.size
            val totalSize = dataSize + 36
            val header = byteArrayOf(
                'R'.code.toByte(), 'I'.code.toByte(), 'F'.code.toByte(), 'F'.code.toByte(),
                (totalSize and 0xFF).toByte(),
                ((totalSize shr 8) and 0xFF).toByte(),
                ((totalSize shr 16) and 0xFF).toByte(),
                ((totalSize shr 24) and 0xFF).toByte(),
                'W'.code.toByte(), 'A'.code.toByte(), 'V'.code.toByte(), 'E'.code.toByte(),
                'f'.code.toByte(), 'm'.code.toByte(), 't'.code.toByte(), ' '.code.toByte(),
                16, 0, 0, 0, 1, 0, 1, 0,
                (SAMPLE_RATE and 0xFF).toByte(),
                ((SAMPLE_RATE shr 8) and 0xFF).toByte(),
                ((SAMPLE_RATE shr 16) and 0xFF).toByte(),
                ((SAMPLE_RATE shr 24) and 0xFF).toByte(),
                ((SAMPLE_RATE * 2) and 0xFF).toByte(),
                (((SAMPLE_RATE * 2) shr 8) and 0xFF).toByte(),
                (((SAMPLE_RATE * 2) shr 16) and 0xFF).toByte(),
                (((SAMPLE_RATE * 2) shr 24) and 0xFF).toByte(),
                2, 0, 16, 0,
                'd'.code.toByte(), 'a'.code.toByte(), 't'.code.toByte(), 'a'.code.toByte(),
                (dataSize and 0xFF).toByte(),
                ((dataSize shr 8) and 0xFF).toByte(),
                ((dataSize shr 16) and 0xFF).toByte(),
                ((dataSize shr 24) and 0xFF).toByte()
            )
            out.write(header)
            out.write(byteData)
        }
        return soundPool.load(file.absolutePath, 1)
    }
}
