package fr.azk.rpgmtoolkit

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.content.FileProvider
import androidx.work.*
import app.tauri.plugin.JSObject
import org.json.JSONObject
import java.io.File
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.HttpsURLConnection

internal data class UpdateRelease(val version: String, val code: Long, val url: String, val size: Long, val sha256: String) {
    fun json() = JSONObject().put("version", version).put("code", code).put("url", url).put("size", size).put("sha256", sha256)

    companion object {
        const val MAX_APK = 128L * 1024 * 1024
        fun versionCode(version: String): Long {
            val match = Regex("(0|[1-9][0-9]{0,2})\\.(0|[1-9][0-9]{0,2})\\.(0|[1-9][0-9]{0,2})").matchEntire(version)
                ?: error("Version de mise à jour invalide.")
            val parts = match.groupValues.drop(1).map(String::toLong)
            return parts[0] * 1_000_000 + parts[1] * 1_000 + parts[2]
        }

        fun parse(json: JSONObject): UpdateRelease {
            require(!json.getBoolean("draft") && !json.getBoolean("prerelease")) { "Version non stable." }
            val version = json.getString("tag_name").removePrefix("v")
            val code = versionCode(version)
            val assets = json.getJSONArray("assets")
            val candidates = (0 until assets.length()).map(assets::getJSONObject).filter { it.optString("name") == "RPGMToolkit-$version.apk" }
            require(candidates.size == 1) { "APK de la release introuvable." }
            val asset = candidates.single()
            val url = asset.getString("browser_download_url")
            require(url == "https://github.com/azksama/RPGMToolkit/releases/download/v$version/RPGMToolkit-$version.apk") { "Adresse de mise à jour invalide." }
            val size = asset.getLong("size")
            require(size in 1..MAX_APK) { "Taille de mise à jour invalide." }
            val digest = asset.getString("digest").removePrefix("sha256:")
            require(Regex("[a-f0-9]{64}").matches(digest)) { "Empreinte de la release absente." }
            return UpdateRelease(version, code, url, size, digest)
        }

        fun saved(json: JSONObject) = UpdateRelease(json.getString("version"), json.getLong("code"), json.getString("url"), json.getLong("size"), json.getString("sha256"))
    }
}

internal object AppUpdater {
    private const val PERIODIC = "toolkit-update-periodic"
    private const val MANUAL = "toolkit-update-manual"
    private const val CHANNEL = "toolkit-updates"
    private val running = AtomicBoolean(false)
    @Volatile private var phase = "idle"
    @Volatile private var progress = 0
    @Volatile var awaitingPermission = false
    private fun preferences(context: Context) = context.getSharedPreferences("app-updates", Context.MODE_PRIVATE)
    private fun folder(context: Context) = File(context.cacheDir, "updates").also { check(it.isDirectory || it.mkdirs()) }
    private fun apk(context: Context) = File(folder(context), "toolkit-update.apk")
    private fun release(context: Context): UpdateRelease? = preferences(context).getString("release", null)?.let {
        try { UpdateRelease.saved(JSONObject(it)) } catch (_: Exception) { null }
    }
    private fun code(info: PackageInfo): Long = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
    private fun installed(context: Context) = context.packageManager.getPackageInfo(context.packageName, 0)

    fun status(context: Context): JSObject {
        val prefs = preferences(context)
        val release = release(context)?.takeIf { it.code > code(installed(context)) }
        val ready = release != null && prefs.getString("ready", null) == release.sha256 && apk(context).length() == release.size
        val queued = WorkManager.getInstance(context).getWorkInfosForUniqueWork(MANUAL).get().any { it.state == WorkInfo.State.ENQUEUED }
        return JSObject().put("automatic", prefs.getBoolean("automatic", true)).put("wifiOnly", prefs.getBoolean("wifiOnly", true))
            .put("phase", if (running.get()) phase else if (ready) "ready" else if (prefs.contains("error")) "error" else if (queued) "queued" else if (release != null) "available" else if (prefs.contains("checked")) "current" else "idle")
            .put("version", release?.version ?: JSONObject.NULL).put("size", release?.size ?: 0)
            .put("progress", progress).put("checked", prefs.getLong("checked", 0)).put("error", prefs.getString("error", null) ?: JSONObject.NULL)
    }

    fun schedule(context: Context, automatic: Boolean? = null, wifiOnly: Boolean? = null) {
        val prefs = preferences(context)
        prefs.edit().apply { automatic?.let { putBoolean("automatic", it) }; wifiOnly?.let { putBoolean("wifiOnly", it) } }.apply()
        val manager = WorkManager.getInstance(context)
        if (!prefs.getBoolean("automatic", true)) { manager.cancelUniqueWork(PERIODIC); return }
        val constraints = Constraints.Builder().setRequiredNetworkType(if (prefs.getBoolean("wifiOnly", true)) NetworkType.UNMETERED else NetworkType.CONNECTED).build()
        val request = PeriodicWorkRequest.Builder(AppUpdateWorker::class.java, 12, TimeUnit.HOURS)
            .setConstraints(constraints).setInputData(Data.Builder().putBoolean("download", true).putBoolean("automatic", true).build()).build()
        manager.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    fun request(context: Context, download: Boolean) {
        preferences(context).edit().remove("error").apply()
        val work = OneTimeWorkRequest.Builder(AppUpdateWorker::class.java)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setInputData(Data.Builder().putBoolean("download", download).build()).build()
        WorkManager.getInstance(context).enqueueUniqueWork(MANUAL, ExistingWorkPolicy.KEEP, work)
    }

    internal fun allowed(url: URL): Boolean = url.protocol == "https" && url.userInfo == null && (url.port == -1 || url.port == 443) &&
        url.host.lowercase() in setOf("api.github.com", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com")

    private fun connect(address: String): HttpsURLConnection {
        var url = URL(address)
        repeat(6) {
            require(allowed(url)) { "Serveur de mise à jour non autorisé." }
            val connection = (url.openConnection() as HttpsURLConnection).apply {
                instanceFollowRedirects = false; connectTimeout = 15_000; readTimeout = 30_000
                setRequestProperty("User-Agent", "RPGMToolkit/${BuildConfig.VERSION_NAME}")
                setRequestProperty("Accept", if (url.host == "api.github.com") "application/vnd.github+json" else "application/octet-stream")
            }
            val status = connection.responseCode
            if (status in listOf(301, 302, 303, 307, 308)) {
                val location = connection.getHeaderField("Location") ?: error("Redirection invalide.")
                connection.disconnect(); url = URL(url, location)
            } else {
                if (status != 200) { connection.disconnect(); error(if (status == 403 || status == 429) "GitHub est temporairement limité. Réessayez plus tard." else "Mise à jour indisponible (HTTP $status).") }
                return connection
            }
        }
        error("Trop de redirections.")
    }

    fun perform(context: Context, download: Boolean, automatic: Boolean, stopped: () -> Boolean): Boolean {
        if (!running.compareAndSet(false, true)) return false
        val prefs = preferences(context)
        val partial = File(folder(context), "download.part")
        val deadline = SystemClock.elapsedRealtime() + TimeUnit.MINUTES.toMillis(8)
        fun active() {
            check(!stopped() && SystemClock.elapsedRealtime() < deadline && (!automatic || prefs.getBoolean("automatic", true))) { "Téléchargement interrompu. Réessayez." }
        }
        try {
            phase = "checking"; progress = 0
            active()
            val connection = connect("https://api.github.com/repos/azksama/RPGMToolkit/releases/latest")
            val json = try { connection.inputStream.use { input ->
                val output = java.io.ByteArrayOutputStream(); val buffer = ByteArray(8192)
                while (true) { val count = input.read(buffer); if (count < 0) break; active(); require(output.size() + count <= 2 * 1024 * 1024); output.write(buffer, 0, count) }
                JSONObject(output.toString("UTF-8"))
            } } finally { connection.disconnect() }
            val candidate = UpdateRelease.parse(json)
            prefs.edit().putLong("checked", System.currentTimeMillis()).remove("error").apply()
            if (candidate.code <= code(installed(context))) {
                prefs.edit().remove("release").remove("ready").apply(); apk(context).delete(); return true
            }
            prefs.edit().putString("release", candidate.json().toString()).apply()
            if (!download) return true
            if (prefs.getString("ready", null) == candidate.sha256 && apk(context).length() == candidate.size) {
                validate(context, apk(context), candidate); return true
            }
            require(folder(context).usableSpace > candidate.size * 2 + 16 * 1024 * 1024) { "Espace insuffisant pour télécharger la mise à jour." }
            phase = "downloading"
            val source = connect(candidate.url)
            try { source.inputStream.use { input -> partial.outputStream().use { output ->
                val buffer = ByteArray(128 * 1024); var total = 0L
                while (true) {
                    active(); val count = input.read(buffer); if (count < 0) break
                    total += count; require(total <= candidate.size) { "Taille de l’APK incorrecte." }
                    output.write(buffer, 0, count); progress = (total * 100 / candidate.size).toInt()
                }
                require(total == candidate.size) { "Téléchargement incomplet." }; output.fd.sync()
            } } } finally { source.disconnect() }
            validate(context, partial, candidate)
            java.nio.file.Files.move(partial.toPath(), apk(context).toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING)
            prefs.edit().putString("ready", candidate.sha256).remove("error").apply()
            notifyReady(context, candidate.version)
            return true
        } catch (error: Exception) {
            prefs.edit().putString("error", error.message ?: "La mise à jour a échoué.").apply()
            return false
        } finally { partial.delete(); phase = "idle"; running.set(false) }
    }

    @Suppress("DEPRECATION")
    internal fun validate(context: Context, file: File, expected: UpdateRelease) {
        require(file.isFile && file.length() == expected.size) { "APK incomplet." }
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input -> val buffer = ByteArray(128 * 1024); while (true) { val count = input.read(buffer); if (count < 0) break; digest.update(buffer, 0, count) } }
        require(digest.digest().joinToString("") { "%02x".format(it) } == expected.sha256) { "Empreinte de l’APK incorrecte." }
        val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
        val current = context.packageManager.getPackageInfo(context.packageName, flags)
        val archive = context.packageManager.getPackageArchiveInfo(file.path, flags) ?: error("APK invalide.")
        require(archive.packageName == context.packageName && code(archive) == expected.code && code(archive) > code(current)) { "L’APK ne correspond pas à cette mise à jour." }
        fun signatures(info: PackageInfo): Set<String> = (if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures)
            ?.map { it.toCharsString() }?.toSet() ?: emptySet()
        val trusted = signatures(current)
        require(trusted.isNotEmpty() && signatures(archive) == trusted) { "La signature de l’APK ne correspond pas à l’application installée." }
    }

    fun install(activity: Activity) {
        val release = release(activity) ?: error("Aucune mise à jour téléchargée.")
        validate(activity, apk(activity), release)
        activity.runOnUiThread {
            if (!activity.packageManager.canRequestPackageInstalls()) {
                awaitingPermission = true
                activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")))
            } else {
                awaitingPermission = false
                val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", apk(activity))
                activity.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
            }
        }
    }

    private fun notifyReady(context: Context, version: String) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Mises à jour", NotificationManager.IMPORTANCE_DEFAULT))
        val intent = PendingIntent.getActivity(context, 110, Intent(context, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        try { manager.notify(110, NotificationCompat.Builder(context, CHANNEL).setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("Toolkit $version est prêt").setContentText("Ouvrez les réglages pour installer la mise à jour.").setContentIntent(intent).setAutoCancel(true).build()) } catch (_: SecurityException) { }
    }
}

class AppUpdateWorker(context: Context, parameters: WorkerParameters) : Worker(context, parameters) {
    override fun doWork(): Result = if (AppUpdater.perform(applicationContext, inputData.getBoolean("download", false), inputData.getBoolean("automatic", false)) { isStopped }) Result.success()
        else if (runAttemptCount < 2 && !isStopped) Result.retry() else Result.failure()
}
