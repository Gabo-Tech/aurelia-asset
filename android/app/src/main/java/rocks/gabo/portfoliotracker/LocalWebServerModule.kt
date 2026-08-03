package rocks.gabo.portfoliotracker

import android.content.res.AssetManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import fi.iki.elonen.NanoHTTPD
import java.io.InputStream
import java.util.Locale

/**
 * Tiny loopback HTTP server that serves the bundled SPA from Android assets.
 * Using http://127.0.0.1 gives a secure context (mic / Web Crypto) without NDK.
 */
class LocalWebServerModule(private val ctx: ReactApplicationContext) :
  ReactContextBaseJavaModule(ctx) {

  @Volatile private var server: AssetServer? = null

  override fun getName(): String = "LocalWebServer"

  @ReactMethod
  fun start(port: Int, promise: Promise) {
    try {
      synchronized(this) {
        server?.stop()
        val srv = AssetServer(ctx.assets, "web", port)
        srv.start()
        server = srv
        promise.resolve("http://127.0.0.1:$port")
      }
    } catch (e: Exception) {
      promise.reject("server_start_failed", e.message, e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      synchronized(this) {
        server?.stop()
        server = null
      }
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("server_stop_failed", e.message, e)
    }
  }

  private class AssetServer(
    private val assets: AssetManager,
    private val root: String,
    port: Int,
  ) : NanoHTTPD("127.0.0.1", port) {

    override fun serve(session: IHTTPSession): Response {
      try {
        var uri = session.uri ?: "/"
        val q = uri.indexOf('?')
        if (q >= 0) uri = uri.substring(0, q)
        if (uri == "/" || uri.isEmpty()) uri = "/index.html"
        // Prevent path traversal
        if (uri.contains("..")) {
          return newFixedLengthResponse(Response.Status.FORBIDDEN, MIME_PLAINTEXT, "Forbidden")
        }
        val assetPath = (root + uri).removePrefix("/")
        val stream: InputStream = try {
          assets.open(assetPath)
        } catch (_: Exception) {
          // SPA fallback: serve index.html for unknown paths (client routing)
          try {
            assets.open("$root/index.html")
          } catch (e2: Exception) {
            return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Not found")
          }
        }
        val mime = mimeFor(uri)
        return newChunkedResponse(Response.Status.OK, mime, stream)
      } catch (e: Exception) {
        return newFixedLengthResponse(
          Response.Status.INTERNAL_ERROR,
          MIME_PLAINTEXT,
          e.message ?: "error",
        )
      }
    }

    private fun mimeFor(path: String): String {
      val lower = path.lowercase(Locale.US)
      return when {
        lower.endsWith(".html") -> "text/html; charset=utf-8"
        lower.endsWith(".js") -> "application/javascript; charset=utf-8"
        lower.endsWith(".mjs") -> "application/javascript; charset=utf-8"
        lower.endsWith(".css") -> "text/css; charset=utf-8"
        lower.endsWith(".json") -> "application/json; charset=utf-8"
        lower.endsWith(".svg") -> "image/svg+xml"
        lower.endsWith(".png") -> "image/png"
        lower.endsWith(".jpg") || lower.endsWith(".jpeg") -> "image/jpeg"
        lower.endsWith(".webp") -> "image/webp"
        lower.endsWith(".ico") -> "image/x-icon"
        lower.endsWith(".woff") -> "font/woff"
        lower.endsWith(".woff2") -> "font/woff2"
        lower.endsWith(".map") -> "application/json"
        lower.endsWith(".txt") -> "text/plain; charset=utf-8"
        lower.endsWith(".xml") -> "application/xml"
        else -> "application/octet-stream"
      }
    }
  }
}
