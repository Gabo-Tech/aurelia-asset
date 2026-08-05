package rocks.gabo.portfoliotracker

import android.media.MediaPlayer
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Plays generated Sherpa TTS WAV files when streaming AudioTrack is unreliable. */
class WavPlayerModule(private val ctx: ReactApplicationContext) :
  ReactContextBaseJavaModule(ctx) {

  private var player: MediaPlayer? = null
  private val audioManager: AudioManager? by lazy {
    ctx.getSystemService(AudioManager::class.java)
  }
  private var focusRequest: AudioFocusRequest? = null

  override fun getName(): String = "WavPlayer"

  @ReactMethod
  fun play(path: String, promise: Promise) {
    try {
      stopInternal()
      val mp = MediaPlayer()
      val focusOk = requestAudioFocus()
      if (!focusOk) {
        promise.reject("play_failed", "audio_focus_denied")
        return
      }
      mp.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
      )
      mp.setDataSource(path)
      mp.setOnCompletionListener {
        it.release()
        if (player === it) player = null
        abandonAudioFocus()
      }
      mp.setOnErrorListener { p, _, _ ->
        p.release()
        if (player === p) player = null
        abandonAudioFocus()
        true
      }
      mp.prepare()
      mp.start()
      player = mp
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("play_failed", e.message, e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      stopInternal()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("stop_failed", e.message, e)
    }
  }

  private fun stopInternal() {
    player?.let {
      try {
        if (it.isPlaying) it.stop()
      } catch (_: Exception) {
        /* ignore */
      }
      it.release()
    }
    player = null
    abandonAudioFocus()
  }

  private fun requestAudioFocus(): Boolean {
    val am = audioManager ?: return true
    val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
      .setOnAudioFocusChangeListener { change ->
        if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
          stopInternal()
        }
      }
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
      )
      .setAcceptsDelayedFocusGain(false)
      .build()
    focusRequest = request
    return am.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
  }

  private fun abandonAudioFocus() {
    val am = audioManager ?: return
    val req = focusRequest ?: return
    am.abandonAudioFocusRequest(req)
    focusRequest = null
  }
}
