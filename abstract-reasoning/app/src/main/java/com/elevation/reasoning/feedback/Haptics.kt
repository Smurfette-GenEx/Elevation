package com.elevation.reasoning.feedback

import android.os.Build
import android.view.HapticFeedbackConstants
import android.view.View

enum class Haptic { TICK, CONFIRM, REJECT }

/** Maps semantic haptic events to the best platform constant available on the device. */
object Haptics {
    fun perform(view: View, h: Haptic) {
        val constant = when (h) {
            Haptic.TICK -> HapticFeedbackConstants.CLOCK_TICK
            Haptic.CONFIRM -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
            Haptic.REJECT -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
        }
        view.performHapticFeedback(constant)
    }
}
